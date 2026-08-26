import { Inject, Injectable } from '@nestjs/common';
import {
  buildCharacterBible,
  buildStylePrompt,
  ProviderError,
  type ImageGenerationProvider,
} from '@masalim/ai';
import { ERROR_CODES, type CharacterBible, type IllustrationStyle } from '@masalim/types';
import { IMAGE_PROVIDER } from '../../core/ai/ai.module';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JobStepReporter } from '../../core/queue/queue.constants';

export interface RenderSetParams {
  illustrationSetId: string;
  userId: string;
  jobId: string;
}

export interface RenderVariantParams {
  illustrationId: string;
  userId: string;
  jobId: string;
}

@Injectable()
export class IllustrationRenderService {
  constructor(
    @Inject(IMAGE_PROVIDER) private readonly images: ImageGenerationProvider,
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly notifications: NotificationsService,
    private readonly usage: AiUsageTracker,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /** Cover, then one step per page. The counter the app shows is this number. */
  static stepsFor(pageCount: number): number {
    return pageCount + 1;
  }

  /**
   * Illustrates a whole story.
   *
   * The cover is rendered first and then passed back to the provider as a
   * reference image for every page. That is what actually holds the hero
   * together across a twelve-page book — prompt text alone drifts, and a child
   * notices immediately when the boy in the story changes face halfway through
   * (§27).
   */
  async renderSet(params: RenderSetParams, reporter: JobStepReporter): Promise<void> {
    const log = this.logger.child({
      illustrationSetId: params.illustrationSetId,
      userId: params.userId,
      jobId: params.jobId,
    });

    const set = await this.prisma.client.illustrationSet.findUnique({
      where: { id: params.illustrationSetId },
      include: {
        story: { include: { child: true, pages: { orderBy: { pageNumber: 'asc' } } } },
        illustrations: { orderBy: [{ kind: 'asc' }, { variantIndex: 'asc' }] },
      },
    });
    if (!set) {
      throw new AppError(ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND);
    }

    const bible = buildCharacterBible({
      heroName: set.story.heroName,
      heroType: set.story.heroType,
      childAgeInYears: set.story.child?.birthDate
        ? this.ageInYears(set.story.child.birthDate)
        : null,
      style: set.style,
      ...this.palettePreference(set.story.child?.preferences),
    });

    await this.prisma.client.illustrationSet.update({
      where: { id: set.id },
      data: { status: 'PROCESSING', characterBible: bible },
    });

    const cover = set.illustrations.find((illustration) => illustration.kind === 'COVER');
    const pageIllustrations = set.illustrations
      .filter((illustration) => illustration.kind === 'PAGE')
      .sort((a, b) => this.pageNumber(set.story.pages, a) - this.pageNumber(set.story.pages, b));

    let completed = 0;
    let reference: Buffer | undefined;

    // ---- The cover sets the look ------------------------------------------
    if (cover) {
      await reporter.step('job.illustration.cover', completed, {
        current: String(completed),
        total: String(pageIllustrations.length + 1),
      });

      const coverPrompt =
        set.story.summary ??
        `A warm cover scene introducing ${set.story.heroName} at the start of a bedtime story.`;

      const rendered = await this.renderOne({
        illustrationId: cover.id,
        userId: params.userId,
        jobId: params.jobId,
        style: set.style,
        scenePrompt: coverPrompt,
        bible,
        aspect: 'square',
      });
      reference = rendered ?? undefined;
      completed += 1;
    }

    // ---- Pages, each anchored to the cover --------------------------------
    for (const illustration of pageIllustrations) {
      await reporter.step('job.illustration.page', completed, {
        current: String(completed),
        total: String(pageIllustrations.length + 1),
      });

      await this.renderOne({
        illustrationId: illustration.id,
        userId: params.userId,
        jobId: params.jobId,
        style: set.style,
        scenePrompt: illustration.prompt,
        bible,
        aspect: 'landscape',
        ...(reference ? { reference } : {}),
      });
      completed += 1;
    }

    const failures = await this.prisma.client.illustration.count({
      where: { illustrationSetId: set.id, status: 'FAILED' },
    });
    const succeeded = await this.prisma.client.illustration.count({
      where: { illustrationSetId: set.id, status: 'READY' },
    });

    // A set with some images is still useful — the book builder shows the ones
    // that worked and offers to retry the rest, rather than throwing the lot
    // away because one page failed.
    await this.prisma.client.illustrationSet.update({
      where: { id: set.id },
      data: { status: succeeded > 0 ? 'READY' : 'FAILED' },
    });

    if (succeeded > 0) {
      await this.notifications.notify({
        userId: params.userId,
        type: 'ILLUSTRATIONS_READY',
        titleKey: 'notification.illustrationsReady.title',
        bodyKey: 'notification.illustrationsReady.body',
        values: { title: set.story.title, count: String(succeeded) },
        link: { host: 'story', id: set.storyId },
      });
    }

    log.info({ succeeded, failures }, 'illustration set rendered');

    if (succeeded === 0) {
      throw new AppError(ERROR_CODES.ILLUSTRATION_FAILED, 'Every illustration failed');
    }
  }

  /** Re-renders one image as an alternative the parent can choose. */
  async renderVariant(params: RenderVariantParams, reporter: JobStepReporter): Promise<void> {
    const illustration = await this.prisma.client.illustration.findUnique({
      where: { id: params.illustrationId },
      include: {
        illustrationSet: {
          include: { story: { include: { child: true } } },
        },
      },
    });
    if (!illustration) {
      throw new AppError(ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND);
    }

    await reporter.step('job.illustration.page', 0, { current: '0', total: '1' });

    const set = illustration.illustrationSet;
    const bible =
      (set.characterBible as CharacterBible | null) ??
      buildCharacterBible({
        heroName: set.story.heroName,
        heroType: set.story.heroType,
        childAgeInYears: set.story.child?.birthDate
          ? this.ageInYears(set.story.child.birthDate)
          : null,
        style: set.style,
      });

    // The already-selected cover anchors the variant too, so a regenerated page
    // still belongs to the same book.
    const selectedCover = await this.prisma.client.illustration.findFirst({
      where: { illustrationSetId: set.id, kind: 'COVER', isSelected: true, status: 'READY' },
    });
    const reference = selectedCover?.assetId
      ? await this.assets.readAsset(selectedCover.assetId).catch(() => undefined)
      : undefined;

    const rendered = await this.renderOne({
      illustrationId: illustration.id,
      userId: params.userId,
      jobId: params.jobId,
      style: set.style,
      scenePrompt: illustration.prompt,
      bible,
      aspect: illustration.kind === 'COVER' ? 'square' : 'landscape',
      ...(reference ? { reference } : {}),
    });

    await reporter.step('job.illustration.page', 1, { current: '1', total: '1' });

    if (!rendered) {
      throw new AppError(ERROR_CODES.ILLUSTRATION_FAILED, 'The image could not be regenerated');
    }
  }

  /**
   * Renders one image. Returns its bytes, or null when it failed.
   *
   * A single failure never aborts the run: eleven good pages and one retryable
   * gap is a far better outcome for a parent than nothing at all.
   */
  private async renderOne(params: {
    illustrationId: string;
    userId: string;
    jobId: string;
    style: IllustrationStyle;
    scenePrompt: string;
    bible: CharacterBible;
    aspect: 'square' | 'landscape';
    reference?: Buffer;
  }): Promise<Buffer | null> {
    const prompt = buildStylePrompt(params.style, params.scenePrompt, params.bible);

    await this.prisma.client.illustration.update({
      where: { id: params.illustrationId },
      data: { status: 'PROCESSING', prompt, errorCode: null },
    });

    try {
      const result = await this.images.generateImage({
        prompt,
        style: params.style,
        characterBible: params.bible,
        aspect: params.aspect,
        ...(params.reference && this.images.supportsReferenceImages
          ? { referenceImage: params.reference }
          : {}),
      });

      const asset = await this.assets.createInternalAsset({
        userId: params.userId,
        kind: 'ILLUSTRATION',
        body: result.data.data,
        contentType: result.data.contentType,
      });

      await this.prisma.client.illustration.update({
        where: { id: params.illustrationId },
        data: {
          status: 'READY',
          assetId: asset.id,
          ...(result.data.seed ? { seed: result.data.seed } : {}),
        },
      });

      await this.usage.record({
        userId: params.userId,
        jobId: params.jobId,
        operation: 'illustration:generate',
        success: true,
        usage: result.usage,
      });

      return result.data.data;
    } catch (error) {
      const code =
        error instanceof ProviderError && error.kind === 'content_filtered'
          ? ERROR_CODES.STORY_CONTENT_NOT_SUITABLE
          : ERROR_CODES.ILLUSTRATION_FAILED;

      await this.prisma.client.illustration.update({
        where: { id: params.illustrationId },
        data: { status: 'FAILED', errorCode: code },
      });

      this.logger
        .child({ illustrationId: params.illustrationId, jobId: params.jobId })
        .warn({ err: error }, 'illustration failed');

      return null;
    }
  }

  /** The child's favourite colour nudges the palette, when they gave one. */
  private palettePreference(preferences: unknown): { favouriteColour?: string } {
    if (typeof preferences !== 'object' || preferences === null) return {};
    const value = (preferences as { favouriteColour?: unknown }).favouriteColour;
    return typeof value === 'string' && value.length > 0 ? { favouriteColour: value } : {};
  }

  private pageNumber(
    pages: Array<{ id: string; pageNumber: number }>,
    illustration: { storyPageId: string | null },
  ): number {
    return pages.find((page) => page.id === illustration.storyPageId)?.pageNumber ?? 0;
  }

  private ageInYears(birthDate: Date): number {
    const now = this.clock.now();
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
      age -= 1;
    }
    return Math.max(0, age);
  }
}
