import { Injectable } from '@nestjs/common';
import {
  ENTITLEMENT_KEYS,
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AIJobDto,
  type NarrationDto,
  type Paginated,
  type StoryDto,
  type StorySummaryDto,
  type StoryTheme,
} from '@masalim/types';
import type {
  CreateStoryInput,
  ListStoriesInput,
  UpdateStoryInput,
  UpdateStoryProgressInput,
} from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { QueueService } from '../../core/queue/queue.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { StoryGenerationService } from './story-generation.service';

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly rateLimit: RateLimitService,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates a story row and queues generation.
   *
   * Everything that could reject the request runs *before* the row is created,
   * so a parent who has hit their monthly limit does not end up with a stranded
   * DRAFT in their library.
   */
  async create(userId: string, input: CreateStoryInput): Promise<{ story: StoryDto; job: AIJobDto }> {
    await this.rateLimit.enforceAll(
      [RATE_LIMIT_KEYS.STORY_GENERATION_HOURLY, RATE_LIMIT_KEYS.STORY_GENERATION_DAILY],
      userId,
    );

    if (input.childId) {
      await this.policy.assertChild(userId, input.childId);
    }

    // The narrator is validated up front: discovering after generation that a
    // free account cannot use the mother's voice would be exactly the surprise
    // paywall the brief forbids.
    if (input.voiceProfileId) {
      const voice = await this.policy.assertVoiceProfile(userId, input.voiceProfileId);
      if (voice.status !== 'READY') {
        throw new AppError(ERROR_CODES.VOICE_NOT_READY);
      }
      await this.entitlements.assertEntitled(userId, ENTITLEMENT_KEYS.PARENT_VOICE_CLONE);
    }

    if (input.systemVoiceId) {
      const systemVoice = await this.prisma.client.systemVoice.findUnique({
        where: { id: input.systemVoiceId },
      });
      if (!systemVoice || !systemVoice.enabled) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'System voice not available');
      }
      if (systemVoice.premiumOnly) {
        await this.entitlements.assertEntitled(
          userId,
          ENTITLEMENT_KEYS.PREMIUM_SYSTEM_VOICES,
        );
      }
    }

    await this.entitlements.consumeQuota(userId, ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT);

    const story = await this.prisma.client.story.create({
      data: {
        userId,
        ...(input.childId ? { childId: input.childId } : {}),
        title: 'Masalın hazırlanıyor',
        heroName: input.heroName,
        heroType: input.heroType,
        themes: input.themes,
        ageRange: input.ageRange,
        durationTarget: input.durationTarget,
        ...(input.customPrompt ? { customPrompt: input.customPrompt } : {}),
        advancedSettings: input.advancedSettings,
        status: 'DRAFT',
      },
    });

    const job = await this.queue.enqueue({
      type: 'STORY_GENERATION',
      userId,
      entityType: 'story',
      entityId: story.id,
      totalSteps: StoryGenerationService.TOTAL_STEPS,
      idempotencyKey: input.idempotencyKey,
      data: {
        voiceProfileId: input.voiceProfileId ?? null,
        systemVoiceId: input.systemVoiceId ?? null,
      },
    });

    return { story: await this.findOne(userId, story.id), job };
  }

  async findOne(userId: string, storyId: string): Promise<StoryDto> {
    await this.policy.assertStory(userId, storyId);

    const story = await this.prisma.client.story.findUniqueOrThrow({
      where: { id: storyId },
      include: {
        child: true,
        pages: { orderBy: { pageNumber: 'asc' } },
        narrations: {
          orderBy: { createdAt: 'desc' },
          include: { voiceProfile: true, systemVoice: true },
        },
        illustrationSets: { include: { illustrations: true } },
        books: { where: { deletedAt: null }, select: { id: true } },
        favourites: { where: { userId }, select: { userId: true } },
      },
    });

    const coverIllustration = story.illustrationSets
      .flatMap((set) => set.illustrations)
      .find((illustration) => illustration.kind === 'COVER' && illustration.isSelected);

    const [coverUrl, pageUrls, narrations] = await Promise.all([
      this.assets.signedUrlForAsset(coverIllustration?.assetId ?? null),
      Promise.all(
        story.pages.map(async (page) => {
          const illustration = story.illustrationSets
            .flatMap((set) => set.illustrations)
            .find(
              (candidate) => candidate.storyPageId === page.id && candidate.isSelected,
            );
          return this.assets.signedUrlForAsset(illustration?.assetId ?? null);
        }),
      ),
      Promise.all(story.narrations.map((narration) => this.toNarrationDto(narration))),
    ]);

    const primaryNarration = narrations.find((narration) => narration.status === 'READY');

    return {
      id: story.id,
      title: story.title,
      summary: story.summary,
      childId: story.childId,
      childName: story.child?.name ?? null,
      themes: story.themes as StoryTheme[],
      ageRange: story.ageRange,
      status: story.status,
      coverImageUrl: coverUrl,
      durationSeconds: primaryNarration?.durationSeconds ?? null,
      narratorLabel: primaryNarration?.narratorLabel ?? null,
      hasBook: story.books.length > 0,
      hasIllustrations: story.illustrationSets.some((set) => set.status === 'READY'),
      isFavourite: story.favourites.length > 0,
      createdAt: story.createdAt.toISOString(),
      heroName: story.heroName,
      heroType: story.heroType,
      durationTarget: story.durationTarget,
      customPrompt: story.customPrompt,
      advancedSettings: (story.advancedSettings ?? {}) as StoryDto['advancedSettings'],
      moderationStatus: story.moderationStatus,
      pages: story.pages.map((page, index) => ({
        id: page.id,
        pageNumber: page.pageNumber,
        text: page.text,
        illustrationUrl: pageUrls[index] ?? null,
      })),
      narrations,
      version: story.version,
      updatedAt: story.updatedAt.toISOString(),
    };
  }

  /** Cursor pagination: an offset would repeat or skip rows as new stories land. */
  async list(userId: string, input: ListStoriesInput): Promise<Paginated<StorySummaryDto>> {
    const where = {
      userId,
      ...(input.childId ? { childId: input.childId } : {}),
      ...(input.search
        ? { title: { contains: input.search, mode: 'insensitive' as const } }
        : {}),
      ...(input.filter === 'favourites' ? { favourites: { some: { userId } } } : {}),
      ...(input.filter === 'audio'
        ? { narrations: { some: { status: 'READY' as const } } }
        : {}),
      ...(input.filter === 'books' ? { books: { some: { deletedAt: null } } } : {}),
    };

    const orderBy =
      input.sort === 'oldest'
        ? { createdAt: 'asc' as const }
        : input.sort === 'title'
          ? { title: 'asc' as const }
          : { createdAt: 'desc' as const };

    const rows = await this.prisma.client.story.findMany({
      where,
      orderBy,
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        child: { select: { name: true } },
        narrations: {
          where: { status: 'READY' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { voiceProfile: true, systemVoice: true },
        },
        illustrationSets: {
          include: { illustrations: { where: { kind: 'COVER', isSelected: true }, take: 1 } },
        },
        books: { where: { deletedAt: null }, select: { id: true } },
        favourites: { where: { userId }, select: { userId: true } },
      },
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const items = await Promise.all(
      page.map(async (story) => {
        const cover = story.illustrationSets.flatMap((set) => set.illustrations)[0];
        const narration = story.narrations[0];

        return {
          id: story.id,
          title: story.title,
          summary: story.summary,
          childId: story.childId,
          childName: story.child?.name ?? null,
          themes: story.themes as StoryTheme[],
          ageRange: story.ageRange,
          status: story.status,
          coverImageUrl: await this.assets.signedUrlForAsset(cover?.assetId ?? null),
          durationSeconds: narration?.durationSeconds ?? null,
          narratorLabel: narration
            ? (narration.voiceProfile?.displayName ??
              narration.systemVoice?.displayName ??
              null)
            : null,
          hasBook: story.books.length > 0,
          hasIllustrations: story.illustrationSets.some((set) => set.status === 'READY'),
          isFavourite: story.favourites.length > 0,
          createdAt: story.createdAt.toISOString(),
        } satisfies StorySummaryDto;
      }),
    );

    const last = page.at(-1);

    return {
      items,
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
  }

  /**
   * Edits story text.
   *
   * Bumps the version and snapshots it, so a book already ordered against the
   * previous version keeps rendering what was actually bought (§80).
   */
  async update(userId: string, storyId: string, input: UpdateStoryInput): Promise<StoryDto> {
    const story = await this.policy.assertStory(userId, storyId);
    if (story.status !== 'READY') {
      throw new AppError(ERROR_CODES.STORY_NOT_READY);
    }

    if (!input.title && !input.pages) {
      return this.findOne(userId, storyId);
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (input.pages) {
        for (const page of input.pages) {
          const existing = await tx.storyPage.findUnique({ where: { id: page.id } });
          if (!existing || existing.storyId !== storyId) {
            throw new AppError(ERROR_CODES.STORY_NOT_FOUND, 'Page does not belong to story');
          }
          await tx.storyPage.update({ where: { id: page.id }, data: { text: page.text } });
        }
      }

      const pages = await tx.storyPage.findMany({
        where: { storyId },
        orderBy: { pageNumber: 'asc' },
      });
      const nextVersion = story.version + 1;

      await tx.story.update({
        where: { id: storyId },
        data: {
          ...(input.title ? { title: input.title } : {}),
          storyText: pages.map((page) => page.text).join('\n\n'),
          version: nextVersion,
        },
      });

      await tx.storyVersion.create({
        data: {
          storyId,
          version: nextVersion,
          title: input.title ?? story.title,
          pages: pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
        },
      });
    });

    return this.findOne(userId, storyId);
  }

  async remove(userId: string, storyId: string): Promise<void> {
    await this.policy.assertStory(userId, storyId);
    await this.prisma.client.story.update({
      where: { id: storyId },
      data: { deletedAt: this.clock.now() },
    });
  }

  async setFavourite(userId: string, storyId: string, favourite: boolean): Promise<void> {
    await this.policy.assertStory(userId, storyId);
    if (favourite) {
      await this.prisma.client.favourite.upsert({
        where: { userId_storyId: { userId, storyId } },
        create: { userId, storyId },
        update: {},
      });
    } else {
      await this.prisma.client.favourite
        .delete({ where: { userId_storyId: { userId, storyId } } })
        .catch(() => undefined);
    }
  }

  async updateProgress(
    userId: string,
    storyId: string,
    input: UpdateStoryProgressInput,
  ): Promise<void> {
    await this.policy.assertStory(userId, storyId);
    await this.policy.assertNarration(userId, input.narrationId);

    await this.prisma.client.storyProgress.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: {
        userId,
        storyId,
        narrationId: input.narrationId,
        positionSeconds: Math.round(input.positionSeconds),
        completed: input.completed,
      },
      update: {
        narrationId: input.narrationId,
        positionSeconds: Math.round(input.positionSeconds),
        completed: input.completed,
      },
    });
  }

  async toNarrationDto(narration: {
    id: string;
    storyId: string;
    status: NarrationDto['status'];
    audioAssetId: string | null;
    durationSeconds: number | null;
    voiceProfileId: string | null;
    systemVoiceId: string | null;
    createdAt: Date;
    voiceProfile?: { displayName: string } | null;
    systemVoice?: { displayName: string } | null;
  }): Promise<NarrationDto> {
    return {
      id: narration.id,
      storyId: narration.storyId,
      status: narration.status,
      audioUrl: await this.assets.signedUrlForAsset(narration.audioAssetId),
      durationSeconds: narration.durationSeconds,
      narratorLabel:
        narration.voiceProfile?.displayName ?? narration.systemVoice?.displayName ?? '',
      voiceProfileId: narration.voiceProfileId,
      systemVoiceId: narration.systemVoiceId,
      createdAt: narration.createdAt.toISOString(),
    };
  }
}
