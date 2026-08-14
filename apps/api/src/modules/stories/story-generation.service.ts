import { Inject, Injectable } from '@nestjs/common';
import {
  buildStoryPrompt,
  ProviderError,
  type StoryGenerationInput,
  type StoryGenerationProvider,
} from '@masalim/ai';
import { generatedStorySchema, type GeneratedStory } from '@masalim/validation';
import { ERROR_CODES } from '@masalim/types';
import { STORY_PROVIDER } from '../../core/ai/ai.module';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JobStepReporter } from '../../core/queue/queue.constants';

/** One repair attempt: a second schema failure means something is genuinely wrong. */
const MAX_REPAIR_ATTEMPTS = 1;

export interface GenerateStoryParams {
  storyId: string;
  userId: string;
  jobId: string;
}

/**
 * The story generation pipeline.
 *
 * Ordering is deliberate: the parent's idea is checked *before* a single token
 * is spent, and the finished text is checked again before it is ever persisted,
 * so an unsafe story cannot exist in the database even briefly.
 */
@Injectable()
export class StoryGenerationService {
  /** Steps a client can see progress through. */
  static readonly TOTAL_STEPS = 4;

  constructor(
    @Inject(STORY_PROVIDER) private readonly provider: StoryGenerationProvider,
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly usage: AiUsageTracker,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async generate(params: GenerateStoryParams, reporter: JobStepReporter): Promise<void> {
    const log = this.logger.child({
      storyId: params.storyId,
      userId: params.userId,
      jobId: params.jobId,
    });

    const story = await this.prisma.client.story.findUnique({
      where: { id: params.storyId },
      include: { child: { include: { interests: { include: { interest: true } } } } },
    });

    if (!story || story.deletedAt) {
      throw new AppError(ERROR_CODES.STORY_NOT_FOUND);
    }

    await this.prisma.client.story.update({
      where: { id: story.id },
      data: { status: 'GENERATING' },
    });

    // ---- Step 1: check the parent's idea before spending anything ----------
    await reporter.step('job.story.checking', 1);

    if (story.customPrompt) {
      try {
        await this.moderation.assertSafe({
          userId: params.userId,
          subjectType: 'prompt',
          subjectId: story.id,
          subject: 'PARENT_PROMPT',
          text: story.customPrompt,
          ageRange: story.ageRange,
          jobId: params.jobId,
        });
      } catch (error) {
        await this.markRejected(story.id, 'input_rejected');
        throw error;
      }
    }

    // ---- Step 2: write the story ------------------------------------------
    await reporter.step('job.story.writing', 2);

    const input = this.toGenerationInput(story);
    const prompt = buildStoryPrompt(input);

    let generated: GeneratedStory;
    try {
      const result = await this.provider.generateStory(input, prompt);
      generated = result.data;
      await this.usage.record({
        userId: params.userId,
        jobId: params.jobId,
        operation: 'story:generate',
        success: true,
        usage: result.usage,
      });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'invalid_response') {
        generated = await this.repair(params, prompt, error, log);
      } else {
        await this.markFailed(story.id);
        throw this.toDomainError(error);
      }
    }

    // ---- Step 3: check the finished story ----------------------------------
    await reporter.step('job.story.checking', 3);

    const fullText = generated.pages.map((page) => page.text).join('\n\n');
    try {
      await this.moderation.assertSafe({
        userId: params.userId,
        subjectType: 'story',
        subjectId: story.id,
        subject: 'GENERATED_STORY',
        text: fullText,
        ageRange: story.ageRange,
        jobId: params.jobId,
      });
    } catch (error) {
      // The text is discarded rather than saved as rejected: an unsafe story
      // must not sit in the database where a later bug could surface it.
      await this.markRejected(story.id, 'output_rejected');
      throw error;
    }

    // ---- Step 4: persist ---------------------------------------------------
    await reporter.step('job.story.saving', 4);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.storyPage.deleteMany({ where: { storyId: story.id } });

      await tx.story.update({
        where: { id: story.id },
        data: {
          title: generated.title,
          summary: generated.summary,
          storyText: fullText,
          status: 'READY',
          moderationStatus: 'APPROVED',
          moderationReason: null,
          pages: {
            create: generated.pages.map((page) => ({
              pageNumber: page.pageNumber,
              text: page.text,
              illustrationPrompt: page.illustrationPrompt,
            })),
          },
        },
      });

      // A version snapshot at creation, so a book ordered later can pin the
      // exact text the parent approved.
      await tx.storyVersion.upsert({
        where: { storyId_version: { storyId: story.id, version: story.version } },
        create: {
          storyId: story.id,
          version: story.version,
          title: generated.title,
          pages: generated.pages.map((page) => ({
            pageNumber: page.pageNumber,
            text: page.text,
          })),
        },
        update: {},
      });
    });

    await this.notifications.notify({
      userId: params.userId,
      type: 'STORY_READY',
      titleKey: 'notification.storyReady.title',
      bodyKey: 'notification.storyReady.body',
      values: { title: generated.title },
      link: { host: 'story', id: story.id },
    });

    log.info({ pages: generated.pages.length }, 'story generated');
  }

  private async repair(
    params: GenerateStoryParams,
    prompt: ReturnType<typeof buildStoryPrompt>,
    firstError: ProviderError,
    log: ReturnType<AppLogger['child']>,
  ): Promise<GeneratedStory> {
    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
      log.warn({ attempt }, 'story failed schema validation; attempting repair');
      try {
        const result = await this.provider.repairStory(prompt, '', [firstError.message]);
        const parsed = generatedStorySchema.safeParse(result.data);
        if (parsed.success) {
          await this.usage.record({
            userId: params.userId,
            jobId: params.jobId,
            operation: 'story:repair',
            success: true,
            usage: result.usage,
          });
          return parsed.data;
        }
      } catch (error) {
        log.warn({ err: error, attempt }, 'repair attempt failed');
      }
    }

    await this.markFailed(params.storyId);
    throw new AppError(ERROR_CODES.STORY_GENERATION_FAILED, 'Story could not be structured');
  }

  private toGenerationInput(story: {
    heroName: string;
    heroType: StoryGenerationInput['heroType'];
    themes: string[];
    ageRange: StoryGenerationInput['ageRange'];
    durationTarget: StoryGenerationInput['duration'];
    customPrompt: string | null;
    advancedSettings: unknown;
    language: StoryGenerationInput['language'];
    child: {
      name: string;
      birthDate: Date | null;
      customInterests: string[];
      interests: Array<{ interest: { slug: string } }>;
    } | null;
  }): StoryGenerationInput {
    const child = story.child;

    return {
      childName: child?.name ?? null,
      childAgeInYears: child?.birthDate ? this.ageInYears(child.birthDate) : null,
      childInterests: child
        ? [...child.interests.map(({ interest }) => interest.slug), ...child.customInterests]
        : [],
      heroName: story.heroName,
      heroType: story.heroType,
      themes: story.themes as StoryGenerationInput['themes'],
      ageRange: story.ageRange,
      duration: story.durationTarget,
      customPrompt: story.customPrompt,
      advancedSettings: (story.advancedSettings ??
        {}) as StoryGenerationInput['advancedSettings'],
      language: story.language,
    };
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

  private async markFailed(storyId: string): Promise<void> {
    await this.prisma.client.story
      .update({ where: { id: storyId }, data: { status: 'FAILED' } })
      .catch(() => undefined);
  }

  private async markRejected(storyId: string, reason: string): Promise<void> {
    await this.prisma.client.story
      .update({
        where: { id: storyId },
        data: {
          status: 'REJECTED',
          moderationStatus: 'REJECTED',
          moderationReason: reason,
        },
      })
      .catch(() => undefined);
  }

  private toDomainError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof ProviderError) {
      if (error.kind === 'content_filtered') {
        return new AppError(ERROR_CODES.STORY_CONTENT_NOT_SUITABLE);
      }
      if (error.kind === 'timeout') {
        return new AppError(ERROR_CODES.STORY_GENERATION_TIMEOUT);
      }
      return new AppError(ERROR_CODES.STORY_GENERATION_FAILED, error.message, {
        cause: error,
      });
    }
    return new AppError(ERROR_CODES.STORY_GENERATION_FAILED, 'Story generation failed', {
      cause: error,
    });
  }
}
