import { Inject, Injectable } from '@nestjs/common';
import type { ModerationProvider, ModerationSubject } from '@masalim/ai';
import { ERROR_CODES, type AgeRange } from '@masalim/types';
import { MODERATION_PROVIDER } from '../../core/ai/ai.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';

export interface ModerationCheckParams {
  userId: string;
  subjectType: 'story' | 'prompt';
  subjectId: string;
  subject: ModerationSubject;
  text: string;
  ageRange: AgeRange;
  jobId?: string | undefined;
}

/**
 * Child-safety gate.
 *
 * Runs twice per story: once on the parent's idea before anything is generated,
 * and once on the finished text before it is persisted. The second pass is the
 * one that matters — a safe prompt can still produce an unsafe story.
 */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(MODERATION_PROVIDER) private readonly provider: ModerationProvider,
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageTracker,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Throws `STORY_CONTENT_NOT_SUITABLE` when the content is rejected.
   *
   * The reason code is written to the audit trail but never returned: the
   * parent sees only the gentle "let's change the idea together" message. Being
   * told *which* category tripped would be both unhelpful and a roadmap for
   * working around the filter.
   */
  async assertSafe(params: ModerationCheckParams): Promise<void> {
    const verdict = await this.check(params);

    if (!verdict.allowed) {
      throw new AppError(
        ERROR_CODES.STORY_CONTENT_NOT_SUITABLE,
        'Content rejected by the safety check',
        {
          logContext: {
            subjectType: params.subjectType,
            stage: params.subject,
            reasonCode: verdict.reasonCode,
          },
        },
      );
    }
  }

  async check(params: ModerationCheckParams): Promise<{
    allowed: boolean;
    reasonCode: string | null;
  }> {
    const result = await this.provider.check({
      text: params.text,
      subject: params.subject,
      ageRange: params.ageRange,
    });

    await this.usage.record({
      userId: params.userId,
      jobId: params.jobId,
      operation: `moderation:${params.subject}`,
      success: true,
      usage: result.usage,
    });

    await this.prisma.client.moderationRecord
      .create({
        data: {
          subjectType: params.subjectType,
          subjectId: params.subjectId,
          stage: params.subject === 'PARENT_PROMPT' ? 'INPUT' : 'OUTPUT',
          provider: this.provider.name,
          verdict: result.data.allowed ? 'APPROVED' : 'REJECTED',
          categories: result.data.categories,
          ...(result.data.reasonCode ? { reasonCode: result.data.reasonCode } : {}),
        },
      })
      .catch(() => undefined);

    if (!result.data.allowed) {
      this.logger
        .child({ userId: params.userId, subjectId: params.subjectId })
        .warn(
          { reasonCode: result.data.reasonCode, stage: params.subject },
          'content rejected by safety check',
        );
    }

    return { allowed: result.data.allowed, reasonCode: result.data.reasonCode };
  }
}
