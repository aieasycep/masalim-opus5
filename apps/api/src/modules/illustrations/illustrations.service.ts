import { Injectable } from '@nestjs/common';
import {
  ENTITLEMENT_KEYS,
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AIJobDto,
  type IllustrationDto,
  type IllustrationSetDto,
} from '@masalim/types';
import type { CreateIllustrationSetInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { QueueService } from '../../core/queue/queue.service';
import { AppError } from '../../core/errors/app-error';
import { AssetsService } from '../assets/assets.service';
import { IllustrationRenderService } from './illustration-render.service';

@Injectable()
export class IllustrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly rateLimit: RateLimitService,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly assets: AssetsService,
  ) {}

  /**
   * Starts illustrating a story.
   *
   * The set is created with one placeholder row per image up front — cover, one
   * per page, back cover — so the app can show "3/12 görsel" against a real
   * denominator from the first frame rather than an invented percentage (§29).
   */
  async create(
    userId: string,
    storyId: string,
    input: CreateIllustrationSetInput,
  ): Promise<{ set: IllustrationSetDto; job: AIJobDto }> {
    await this.rateLimit.enforce(RATE_LIMIT_KEYS.ILLUSTRATION_HOURLY, userId);

    const story = await this.policy.assertStory(userId, storyId);
    if (story.status !== 'READY') {
      throw new AppError(ERROR_CODES.STORY_NOT_READY);
    }

    const pages = await this.prisma.client.storyPage.findMany({
      where: { storyId },
      orderBy: { pageNumber: 'asc' },
    });
    if (pages.length === 0) {
      throw new AppError(ERROR_CODES.STORY_NOT_READY, 'Story has no pages to illustrate');
    }

    await this.entitlements.consumeQuota(userId, ENTITLEMENT_KEYS.ILLUSTRATION_MONTHLY_LIMIT);

    const set = await this.prisma.client.illustrationSet.create({
      data: {
        storyId,
        style: input.style,
        status: 'PENDING',
        storyVersion: story.version,
        illustrations: {
          create: [
            { kind: 'COVER', prompt: '', status: 'PENDING' },
            ...pages.map((page) => ({
              kind: 'PAGE' as const,
              storyPageId: page.id,
              prompt: page.illustrationPrompt ?? page.text.slice(0, 200),
              status: 'PENDING' as const,
            })),
          ],
        },
      },
    });

    const job = await this.queue.enqueue({
      type: 'ILLUSTRATION_GENERATION',
      userId,
      entityType: 'illustrationSet',
      entityId: set.id,
      // Cover first, then every page: the honest denominator for the counter.
      totalSteps: IllustrationRenderService.stepsFor(pages.length),
      idempotencyKey: input.idempotencyKey,
    });

    return { set: await this.findOne(userId, set.id), job };
  }

  async listForStory(userId: string, storyId: string): Promise<IllustrationSetDto[]> {
    await this.policy.assertStory(userId, storyId);
    const sets = await this.prisma.client.illustrationSet.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      include: { illustrations: { orderBy: [{ kind: 'asc' }, { variantIndex: 'asc' }] } },
    });
    return Promise.all(sets.map((set) => this.toDto(set)));
  }

  async findOne(userId: string, illustrationSetId: string): Promise<IllustrationSetDto> {
    await this.policy.assertIllustrationSet(userId, illustrationSetId);
    const set = await this.prisma.client.illustrationSet.findUniqueOrThrow({
      where: { id: illustrationSetId },
      include: { illustrations: { orderBy: [{ kind: 'asc' }, { variantIndex: 'asc' }] } },
    });
    return this.toDto(set);
  }

  /**
   * Produces another take on one image.
   *
   * A new variant rather than an overwrite: the parent compares them side by
   * side and picks, and the one they had is never destroyed by trying again.
   */
  async regenerate(
    userId: string,
    illustrationId: string,
    idempotencyKey: string,
  ): Promise<{ illustration: IllustrationDto; job: AIJobDto }> {
    await this.rateLimit.enforce(RATE_LIMIT_KEYS.ILLUSTRATION_HOURLY, userId);

    const existing = await this.policy.assertIllustration(userId, illustrationId);

    const variantIndex = await this.prisma.client.illustration.count({
      where: {
        illustrationSetId: existing.illustrationSetId,
        kind: existing.kind,
        storyPageId: existing.storyPageId,
      },
    });

    const variant = await this.prisma.client.illustration.create({
      data: {
        illustrationSetId: existing.illustrationSetId,
        ...(existing.storyPageId ? { storyPageId: existing.storyPageId } : {}),
        kind: existing.kind,
        variantIndex,
        prompt: existing.prompt,
        status: 'PENDING',
        // Not selected yet — the parent chooses once they can see it.
        isSelected: false,
      },
    });

    const job = await this.queue.enqueue({
      type: 'ILLUSTRATION_GENERATION',
      userId,
      entityType: 'illustration',
      entityId: variant.id,
      totalSteps: 1,
      idempotencyKey,
      data: { mode: 'variant' },
    });

    return { illustration: await this.toIllustrationDto(variant), job };
  }

  /** Picks which variant of an image the book uses. */
  async select(userId: string, illustrationId: string): Promise<IllustrationSetDto> {
    const illustration = await this.policy.assertIllustration(userId, illustrationId);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.illustration.updateMany({
        where: {
          illustrationSetId: illustration.illustrationSetId,
          kind: illustration.kind,
          storyPageId: illustration.storyPageId,
        },
        data: { isSelected: false },
      });
      await tx.illustration.update({
        where: { id: illustration.id },
        data: { isSelected: true },
      });
    });

    return this.findOne(userId, illustration.illustrationSetId);
  }

  async toDto(set: {
    id: string;
    storyId: string;
    style: IllustrationSetDto['style'];
    status: IllustrationSetDto['status'];
    createdAt: Date;
    illustrations: Array<Parameters<IllustrationsService['toIllustrationDto']>[0]>;
  }): Promise<IllustrationSetDto> {
    const illustrations = await Promise.all(
      set.illustrations.map((illustration) => this.toIllustrationDto(illustration)),
    );
    const ready = illustrations.filter((illustration) => illustration.imageUrl !== null).length;

    return {
      id: set.id,
      storyId: set.storyId,
      style: set.style,
      status: set.status,
      illustrations,
      readyCount: ready,
      totalCount: illustrations.length,
      createdAt: set.createdAt.toISOString(),
    };
  }

  async toIllustrationDto(illustration: {
    id: string;
    kind: IllustrationDto['kind'];
    storyPageId: string | null;
    assetId: string | null;
    variantIndex: number;
    isSelected: boolean;
    status: IllustrationDto['status'];
    errorCode: string | null;
  }): Promise<IllustrationDto> {
    return {
      id: illustration.id,
      kind: illustration.kind,
      storyPageId: illustration.storyPageId,
      imageUrl: await this.assets.signedUrlForAsset(illustration.assetId),
      variantIndex: illustration.variantIndex,
      isSelected: illustration.isSelected,
      status: illustration.status,
      errorCode: illustration.errorCode,
    };
  }
}
