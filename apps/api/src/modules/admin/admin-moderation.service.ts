import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type AdminModerationRecordDto,
  type AdminModerationSubjectDto,
  type Paginated,
} from '@masalim/types';
import {
  REVIEWABLE_MODERATION_VERDICTS,
  type AdminModerationDecisionInput,
  type AdminModerationQueueInput,
  type ReviewableModerationVerdict,
} from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Clock } from '../../core/time/clock';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { ADMIN_AUDIT_ACTIONS, AdminAuditService } from './admin-audit.service';
import type { AdminCallContext } from './admin.decorators';

/** How many provider categories are worth showing for triage. */
const TOP_CATEGORY_COUNT = 5;

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The review queue: automated refusals nobody has looked at yet.
   *
   * The classifier never asks for help — it writes APPROVED or REJECTED and
   * moves on — so what needs a person is the set it refused. Each row is a
   * parent whose story was blocked at bedtime by a machine, and until someone
   * reviews it that decision stands unexamined.
   *
   * Category scores and reason codes only: the queue is a work list, and nobody
   * needs to read a family's story to see how long it has been waiting.
   */
  async queue(input: AdminModerationQueueInput): Promise<Paginated<AdminModerationRecordDto>> {
    const rows = await this.prisma.client.moderationRecord.findMany({
      where: {
        verdict: input.verdict ? input.verdict : { in: [...REVIEWABLE_MODERATION_VERDICTS] },
        reviewedAt: null,
        ...(input.subjectType ? { subjectType: input.subjectType } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((row) => this.toDto(row)),
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
  }

  /**
   * The content behind a queued record.
   *
   * Split from the queue on purpose: reading a child's story is a real intrusion
   * into a family's account, justified here by the safety decision that follows
   * it, and so it is written to the audit trail exactly like a mutation is.
   */
  async subject(
    caller: AdminCallContext,
    recordId: string,
  ): Promise<AdminModerationSubjectDto> {
    const record = await this.prisma.client.moderationRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Moderation record not found');
    }

    // `raw` on purpose: a story the parent has since deleted can still be the
    // subject of an open safety decision, and refusing to show it would leave
    // the queue permanently stuck.
    const story = await this.prisma.raw.story.findUnique({
      where: { id: record.subjectId },
      include: { pages: { orderBy: { pageNumber: 'asc' }, select: { text: true } } },
    });

    const text =
      record.subjectType === 'prompt'
        ? (story?.customPrompt ?? null)
        : (story?.storyText ?? this.joinPages(story?.pages ?? []));

    if (!story || !text) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'The reviewed content is no longer stored; decide from the category scores',
      );
    }

    await this.audit.recordFor(caller, {
      action: ADMIN_AUDIT_ACTIONS.MODERATION_SUBJECT_VIEW,
      subjectType: 'moderation_record',
      subjectId: record.id,
      metadata: {
        storyId: story.id,
        userId: story.userId,
        recordSubjectType: record.subjectType,
      },
    });

    return {
      recordId: record.id,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      text,
      storyTitle: story.title,
      ageRange: story.ageRange,
      language: story.language,
    };
  }

  /**
   * Settles one record.
   *
   * The human decision is written beside the classifier's verdict rather than
   * over it. What the machine said is evidence: it is how anyone later measures
   * the filter's false-positive rate, and overwriting it would erase the only
   * signal that a refusal was wrong.
   *
   * The record and the story it judges move together in one transaction with
   * the audit row, so the trail cannot disagree with the outcome.
   */
  async decide(
    caller: AdminCallContext,
    recordId: string,
    input: AdminModerationDecisionInput,
  ): Promise<AdminModerationRecordDto> {
    const record = await this.prisma.client.moderationRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Moderation record not found');
    }
    if (!REVIEWABLE_MODERATION_VERDICTS.includes(record.verdict as ReviewableModerationVerdict)) {
      throw new AppError(ERROR_CODES.CONFLICT, 'This verdict is not open to review');
    }
    if (record.reviewedAt !== null) {
      throw new AppError(ERROR_CODES.CONFLICT, 'This record has already been reviewed');
    }

    const approved = input.decision === 'APPROVE';
    const outcome = approved ? 'APPROVED' : 'REJECTED';

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const next = await tx.moderationRecord.update({
        where: { id: record.id },
        data: {
          reviewedAt: this.clock.now(),
          reviewedByAdminId: caller.actor.id,
          reviewOutcome: outcome,
          ...(input.note ? { reviewNote: input.note } : {}),
        },
      });

      // `updateMany` rather than `update`: the story may have been deleted since
      // the record was queued, and that must not block the decision.
      await tx.story.updateMany({
        where: { id: record.subjectId },
        data: approved
          ? { moderationStatus: 'APPROVED', moderationReason: null }
          : {
              moderationStatus: 'REJECTED',
              status: 'REJECTED',
              moderationReason: input.reasonCode ?? 'human_review',
            },
      });

      await tx.auditLog.create({
        data: this.audit.rowFor(caller, {
          action: approved
            ? ADMIN_AUDIT_ACTIONS.MODERATION_APPROVE
            : ADMIN_AUDIT_ACTIONS.MODERATION_REJECT,
          subjectType: 'moderation_record',
          subjectId: record.id,
          metadata: {
            storyId: record.subjectId,
            classifierVerdict: record.verdict,
            reviewOutcome: outcome,
            reasonCode: input.reasonCode ?? null,
            note: input.note ?? null,
          },
        }),
      });

      return next;
    });

    this.logger
      .child({ adminUserId: caller.actor.id, recordId: record.id })
      .info({ outcome }, 'moderation record reviewed');

    return this.toDto(updated);
  }

  private joinPages(pages: Array<{ text: string }>): string | null {
    if (pages.length === 0) return null;
    return pages.map((page) => page.text).join('\n\n');
  }

  private toDto(record: {
    id: string;
    subjectType: string;
    subjectId: string;
    stage: AdminModerationRecordDto['stage'];
    provider: string;
    verdict: AdminModerationRecordDto['verdict'];
    reasonCode: string | null;
    categories: unknown;
    createdAt: Date;
    reviewedAt: Date | null;
    reviewOutcome: AdminModerationRecordDto['verdict'] | null;
    reviewNote: string | null;
  }): AdminModerationRecordDto {
    return {
      id: record.id,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      stage: record.stage,
      provider: record.provider,
      verdict: record.verdict,
      reasonCode: record.reasonCode,
      topCategories: this.topCategories(record.categories),
      createdAt: record.createdAt.toISOString(),
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      reviewOutcome: record.reviewOutcome,
      reviewNote: record.reviewNote,
    };
  }

  /** Provider payloads vary, so anything that is not a number is dropped. */
  private topCategories(categories: unknown): Array<{ category: string; score: number }> {
    if (typeof categories !== 'object' || categories === null || Array.isArray(categories)) {
      return [];
    }
    return Object.entries(categories as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([category, score]) => ({ category, score }))
      .sort((left, right) => right.score - left.score)
      .slice(0, TOP_CATEGORY_COUNT);
  }
}
