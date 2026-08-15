import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@masalim/database';
import { StorageObjectNotFoundError, type StorageProvider } from '@masalim/storage';
import { STORAGE_PROVIDER } from '../../core/storage/storage.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { SWEEP_BATCH_SIZE } from './retention.constants';

export interface AssetPurgeResult {
  /** Objects that are no longer in the bucket because of this call. */
  purged: number;
  /** Objects storage refused to give up; the rows stay pending for the retry. */
  failed: number;
  bytesFreed: number;
}

/**
 * A row whose object is still in the bucket.
 *
 * `deletedAt` alone is not proof of a purge — `AssetsService.deleteAsset` sets
 * it, but so does a rejected oversized upload whose object was already removed,
 * and a user-facing delete elsewhere might soft-delete without touching storage.
 * The pair (`deletedAt` set *and* `uploadedAt` cleared) is what this module
 * writes once the object is genuinely gone, which is what makes a second pass
 * over the same rows cheap instead of a full re-delete.
 */
const NOT_YET_PURGED: Prisma.AssetWhereInput = {
  NOT: { AND: [{ deletedAt: { not: null } }, { uploadedAt: null }] },
};

const EMPTY_RESULT: AssetPurgeResult = { purged: 0, failed: 0, bytesFreed: 0 };

/**
 * Removes stored objects, not just the rows that point at them.
 *
 * Unlinking an Asset row and calling it deleted leaves the recording sitting in
 * the bucket forever with nothing left to find it by. Everything here therefore
 * deletes the object first and only marks the row once storage has confirmed —
 * a failure leaves the row exactly as it was so the next run tries again.
 */
@Injectable()
export class AssetPurgeService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /** Purges specific assets; nulls and unknown ids are simply skipped. */
  async purgeByIds(assetIds: ReadonlyArray<string | null | undefined>): Promise<AssetPurgeResult> {
    const ids = assetIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return { ...EMPTY_RESULT };
    return this.purgeWhere({ id: { in: ids } });
  }

  /** Every object this account owns, whatever kind it is. */
  async purgeForUser(userId: string): Promise<AssetPurgeResult> {
    return this.purgeWhere({ userId });
  }

  /**
   * Purges every not-yet-purged asset matching `where`, in batches.
   *
   * The loop stops as soon as a pass purges nothing, so a bucket that is
   * refusing deletes ends the run with a `failed` count instead of spinning.
   */
  async purgeWhere(where: Prisma.AssetWhereInput): Promise<AssetPurgeResult> {
    const result: AssetPurgeResult = { ...EMPTY_RESULT };
    // Rows that storage would not give up. Excluded from the next page so they
    // are counted once and do not sit at the head of every batch.
    const failedIds: string[] = [];

    for (;;) {
      const assets = await this.prisma.raw.asset.findMany({
        where: {
          AND: [where, NOT_YET_PURGED],
          ...(failedIds.length > 0 ? { id: { notIn: failedIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: SWEEP_BATCH_SIZE,
      });
      if (assets.length === 0) break;

      let purgedThisPass = 0;
      for (const asset of assets) {
        if (await this.purgeOne(asset)) {
          purgedThisPass += 1;
          result.purged += 1;
          result.bytesFreed += asset.sizeBytes ?? 0;
        } else {
          failedIds.push(asset.id);
        }
      }

      // A whole page that achieved nothing means storage is unhappy, not that
      // this account has unusual objects; walking the rest would just be slow.
      if (purgedThisPass === 0) break;
    }

    result.failed = failedIds.length;
    return result;
  }

  private async purgeOne(asset: {
    id: string;
    key: string;
    deletedAt: Date | null;
  }): Promise<boolean> {
    try {
      await this.storage.deleteObject(asset.key);
    } catch (error) {
      // An object that is already gone is the state we were asking for.
      if (!(error instanceof StorageObjectNotFoundError)) {
        this.logger
          .child({ assetId: asset.id })
          .error({ err: error }, 'could not delete stored object');
        return false;
      }
    }

    await this.prisma.raw.asset.update({
      where: { id: asset.id },
      data: {
        // Preserved when already set, so the original deletion time is not
        // rewritten by a purge that happens weeks later.
        deletedAt: asset.deletedAt ?? this.clock.now(),
        uploadedAt: null,
      },
    });

    return true;
  }
}
