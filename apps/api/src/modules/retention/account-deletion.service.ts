import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@masalim/types';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { AssetPurgeService } from './asset-purge.service';
import { VoicePurgeService } from './voice-purge.service';
import { RetentionAuditService } from './retention-audit.service';
import {
  AUDIT_SUBJECTS,
  NON_TERMINAL_ORDER_STATUSES,
  RETENTION_AUDIT_ACTIONS,
} from './retention.constants';

export type AccountPurgeOutcome =
  | {
      status: 'purged';
      /** False when the account had already been removed by an earlier attempt. */
      existed: boolean;
      clonesRemoved: number;
      objectsPurged: number;
      bytesFreed: number;
      ordersRemoved: number;
    }
  | {
      status: 'deferred';
      /** Printed-book orders still in flight, which is why nothing was purged. */
      blockingOrders: number;
    };

/**
 * Account erasure.
 *
 * The account was soft-deleted the moment the parent confirmed, so the app has
 * already stopped working for them; this is the irreversible half that runs
 * after the grace period. Order matters and is the whole design: every stored
 * object goes first, while the rows that name those objects still exist, and
 * only then are the rows dropped. Reversing it would leave recordings in the
 * bucket with nothing left to find them by.
 *
 * The User row is really deleted rather than blanked. A tombstone would keep the
 * DeletionRequest visible, but it would also keep a row that a parent asked us
 * to be rid of; the AuditLog entry written in the same transaction as the delete
 * is what remains, and it deliberately has no foreign key to the account it
 * describes.
 *
 * That row is written here rather than by the caller because DeletionRequest
 * cascades from User: once this transaction commits, the request that would
 * have driven a retry is gone too. An audit write afterwards has a window in
 * which a crash leaves the account irreversibly purged and nothing anywhere
 * saying so — which is the one outcome this module exists to prevent.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetPurge: AssetPurgeService,
    private readonly voicePurge: VoicePurgeService,
    private readonly audit: RetentionAuditService,
    private readonly logger: AppLogger,
  ) {}

  async purge(userId: string): Promise<AccountPurgeOutcome> {
    const log = this.logger.child({ userId });

    const user = await this.prisma.raw.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        status: 'purged',
        existed: false,
        clonesRemoved: 0,
        objectsPurged: 0,
        bytesFreed: 0,
        ordersRemoved: 0,
      };
    }

    const blockingOrders = await this.prisma.raw.order.count({
      where: { userId, status: { in: [...NON_TERMINAL_ORDER_STATUSES] } },
    });
    if (blockingOrders > 0) {
      log.warn({ blockingOrders }, 'account deletion deferred: printed orders still in flight');
      return { status: 'deferred', blockingOrders };
    }

    const clonesRemoved = await this.voicePurge.purgeAllClonesForUser(userId);

    const assets = await this.assetPurge.purgeForUser(userId);
    if (assets.failed > 0) {
      // Dropping the rows now would strip the only record of which objects are
      // still sitting in the bucket, so the request stays open for the retry.
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        `${assets.failed} stored objects could not be deleted`,
      );
    }

    const ordersRemoved = await this.prisma.raw.$transaction(async (tx) => {
      // Orders restrict deletion of the books they were printed from, so they
      // go before the cascade from User reaches those books. Everything left
      // here is already in a terminal state.
      const orders = await tx.order.deleteMany({ where: { userId } });

      await tx.auditLog.create({
        data: this.audit.row({
          action: RETENTION_AUDIT_ACTIONS.ACCOUNT_PURGED,
          subjectType: AUDIT_SUBJECTS.USER,
          subjectId: userId,
          metadata: {
            clonesRemoved,
            objectsPurged: assets.purged,
            bytesFreed: assets.bytesFreed,
            ordersRemoved: orders.count,
          },
        }),
      });

      await tx.user.delete({ where: { id: userId } });
      return orders.count;
    });

    log.warn(
      { clonesRemoved, objectsPurged: assets.purged, ordersRemoved },
      'account permanently deleted',
    );

    return {
      status: 'purged',
      existed: true,
      clonesRemoved,
      objectsPurged: assets.purged,
      bytesFreed: assets.bytesFreed,
      ordersRemoved,
    };
  }
}
