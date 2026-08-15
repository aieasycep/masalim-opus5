import { Injectable } from '@nestjs/common';
import { Prisma, type DeletionRequest } from '@masalim/database';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AccountDeletionService } from './account-deletion.service';
import { VoicePurgeService } from './voice-purge.service';
import { RetentionAuditService } from './retention-audit.service';
import {
  AUDIT_SUBJECTS,
  CLAIMABLE_STATUSES,
  DELETION_BATCH_SIZE,
  DELETION_DEFER_DELAY_MS,
  DELETION_RETRY_DELAY_MS,
  RETENTION_AUDIT_ACTIONS,
  STALE_CLAIM_MS,
} from './retention.constants';

export interface DeletionRunSummary {
  /** Requests this worker took ownership of; others may have claimed the rest. */
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
}

/** Diagnostic codes stored on the request so the status screen has a reason. */
const REASON_CODES = {
  ORDER_IN_PROGRESS: 'ORDER_IN_PROGRESS',
  MISSING_SUBJECT: 'MISSING_SUBJECT',
} as const;

const MAX_ERROR_MESSAGE_LENGTH = 1000;

/**
 * Turns DeletionRequest rows into work that actually happened.
 *
 * Scope is the thing this file exists to keep straight: "Sesimi Sil" removes one
 * cloned voice and leaves the family's stories and their consent record intact,
 * while "Hesabımı Sil" removes the account and everything under it. They share
 * the purge primitives and nothing else.
 *
 * A scan rather than an enqueue-on-request: the request row is the queue. A
 * worker that dies mid-purge, a Redis flush, or a request written by a process
 * that never got to enqueue anything all recover on the next pass, and every
 * step underneath is idempotent, so recovering costs a repeated delete of an
 * object that is already gone.
 */
@Injectable()
export class DeletionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly voicePurge: VoicePurgeService,
    private readonly audit: RetentionAuditService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async processDue(): Promise<DeletionRunSummary> {
    const now = this.clock.now();
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);

    const due = await this.prisma.raw.deletionRequest.findMany({
      where: {
        scheduledFor: { lte: now },
        OR: [
          { status: 'SCHEDULED' },
          // Left PROCESSING by a worker that never came back.
          { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { scheduledFor: 'asc' },
      take: DELETION_BATCH_SIZE,
    });

    const summary: DeletionRunSummary = { claimed: 0, completed: 0, deferred: 0, failed: 0 };

    for (const request of due) {
      if (!(await this.claim(request))) continue;
      summary.claimed += 1;

      try {
        const outcome = await this.run(request);
        if (outcome === 'deferred') summary.deferred += 1;
        else if (outcome === 'failed') summary.failed += 1;
        else summary.completed += 1;
      } catch (error) {
        summary.failed += 1;
        await this.recordFailure(request, error);
      }
    }

    return summary;
  }

  /**
   * Optimistic claim.
   *
   * `updatedAt` is maintained by Prisma, so matching on the value we read is
   * enough to guarantee exactly one worker moves a request into PROCESSING even
   * when several are scanning at once.
   */
  private async claim(request: DeletionRequest): Promise<boolean> {
    if (!CLAIMABLE_STATUSES.includes(request.status)) return false;

    const { count } = await this.prisma.raw.deletionRequest.updateMany({
      where: { id: request.id, status: request.status, updatedAt: request.updatedAt },
      data: { status: 'PROCESSING' },
    });
    return count === 1;
  }

  private async run(request: DeletionRequest): Promise<'completed' | 'deferred' | 'failed'> {
    return request.type === 'ACCOUNT'
      ? this.runAccount(request)
      : this.runVoiceProfile(request);
  }

  private async runAccount(request: DeletionRequest): Promise<'completed' | 'deferred'> {
    const outcome = await this.accountDeletion.purge(request.userId);

    if (outcome.status === 'deferred') {
      await this.reschedule(
        request.id,
        DELETION_DEFER_DELAY_MS,
        `${REASON_CODES.ORDER_IN_PROGRESS}: ${outcome.blockingOrders} order(s) still in flight`,
      );
      await this.audit.record({
        action: RETENTION_AUDIT_ACTIONS.ACCOUNT_DEFERRED,
        subjectType: AUDIT_SUBJECTS.USER,
        subjectId: request.userId,
        metadata: { requestId: request.id, blockingOrders: outcome.blockingOrders },
      });
      return 'deferred';
    }

    // No audit write here: AccountDeletionService committed the ACCOUNT_PURGED
    // row inside the same transaction as the delete, because this request row
    // cascades away with the account and could not have driven a retry.
    if (!outcome.existed) {
      await this.audit.record({
        action: RETENTION_AUDIT_ACTIONS.ACCOUNT_PURGED,
        subjectType: AUDIT_SUBJECTS.USER,
        subjectId: request.userId,
        metadata: { requestId: request.id, alreadyPurged: true },
      });
    }

    // The request row belongs to the account and went with it. Marking it
    // complete is attempted anyway for the case where the account was already
    // gone, and a missing row there is the expected outcome rather than an error.
    await this.markCompleted(request.id);
    return 'completed';
  }

  private async runVoiceProfile(
    request: DeletionRequest,
  ): Promise<'completed' | 'failed'> {
    if (!request.subjectId) {
      await this.fail(request.id, `${REASON_CODES.MISSING_SUBJECT}: no voice profile referenced`);
      this.logger
        .child({ requestId: request.id, userId: request.userId })
        .error('voice deletion request has no subject');
      // Marked FAILED a line ago, so reporting it as completed would let a run
      // that deleted nothing read as a clean sweep.
      return 'failed';
    }

    const outcome = await this.voicePurge.purgeProfile(request.subjectId);

    await this.audit.record({
      action: RETENTION_AUDIT_ACTIONS.VOICE_PROFILE_PURGED,
      subjectType: AUDIT_SUBJECTS.VOICE_PROFILE,
      subjectId: request.subjectId,
      metadata: {
        requestId: request.id,
        userId: request.userId,
        alreadyPurged: !outcome.found,
        clonesRemoved: outcome.clonesRemoved,
        objectsPurged: outcome.assets.purged,
        bytesFreed: outcome.assets.bytesFreed,
      },
    });

    await this.markCompleted(request.id);
    return 'completed';
  }

  private async recordFailure(request: DeletionRequest, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    this.logger
      .child({ requestId: request.id, userId: request.userId, type: request.type })
      .error({ err: error }, 'deletion request failed; it will be retried');

    await this.audit
      .record({
        action: RETENTION_AUDIT_ACTIONS.DELETION_FAILED,
        subjectType: AUDIT_SUBJECTS.DELETION_REQUEST,
        subjectId: request.id,
        metadata: {
          userId: request.userId,
          type: request.type,
          message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
        },
      })
      // The retry below matters more than the record of this attempt.
      .catch(() => undefined);

    // Returned to SCHEDULED rather than FAILED: nothing here gives up on a
    // deletion a parent asked for, and every step converges on a re-run.
    await this.reschedule(request.id, DELETION_RETRY_DELAY_MS, message);
  }

  private async reschedule(
    requestId: string,
    delayMs: number,
    reason: string,
  ): Promise<void> {
    await this.updateRequest(requestId, {
      status: 'SCHEDULED',
      scheduledFor: new Date(this.clock.timestamp() + delayMs),
      errorMessage: reason.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    });
  }

  private async fail(requestId: string, reason: string): Promise<void> {
    await this.updateRequest(requestId, {
      status: 'FAILED',
      errorMessage: reason.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    });
  }

  private async markCompleted(requestId: string): Promise<void> {
    await this.updateRequest(requestId, {
      status: 'COMPLETED',
      completedAt: this.clock.now(),
      errorMessage: null,
    });
  }

  private async updateRequest(
    requestId: string,
    data: Prisma.DeletionRequestUpdateInput,
  ): Promise<void> {
    try {
      await this.prisma.raw.deletionRequest.update({ where: { id: requestId }, data });
    } catch (error) {
      // P2025 is "row is gone", which for an account purge is the point.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return;
      throw error;
    }
  }
}
