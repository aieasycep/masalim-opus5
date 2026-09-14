import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../core/config/config.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetPurgeService } from './asset-purge.service';
import { VoicePurgeService } from './voice-purge.service';
import { RetentionAuditService } from './retention-audit.service';
import {
  ABANDONED_UPLOAD_GRACE_MS,
  AUDIT_SUBJECTS,
  RETENTION_AUDIT_ACTIONS,
  SWEEP_BATCH_SIZE,
} from './retention.constants';

export interface RetentionSweepSummary {
  /** The window that was enforced, as published to the app. */
  retentionDays: number;
  recordingsPurged: number;
  abandonedUploadsPurged: number;
  bytesFreed: number;
  failed: number;
}

/**
 * The promise in the settings screen, kept without being asked.
 *
 * `GET /app/config` tells every parent how many days their raw recording is
 * kept, and the number comes from `VOICE_RAW_RETENTION_DAYS`. This sweep reads
 * the same setting rather than a constant of its own, because a window the
 * client publishes and the worker ignores is worse than having no window at all.
 *
 * Two conditions purge a recording, and the second is the one that matters:
 * `rawRetentionUntil` stamped at clone time, *or* a recording older than the
 * window currently configured. Without the second, shortening the window would
 * only apply to parents who enrolled afterwards.
 */
@Injectable()
export class VoiceRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly assetPurge: AssetPurgeService,
    private readonly voicePurge: VoicePurgeService,
    private readonly audit: RetentionAuditService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async sweep(): Promise<RetentionSweepSummary> {
    const retentionDays = this.config.get('VOICE_RAW_RETENTION_DAYS');

    const recordings = await this.purgeExpiredRecordings(retentionDays);
    const uploads = await this.purgeAbandonedUploads();

    const summary: RetentionSweepSummary = {
      retentionDays,
      recordingsPurged: recordings.purged,
      abandonedUploadsPurged: uploads.purged,
      bytesFreed: recordings.bytesFreed + uploads.bytesFreed,
      failed: recordings.failed + uploads.failed,
    };

    this.logger.pino.info(summary, 'retention sweep finished');
    return summary;
  }

  private async purgeExpiredRecordings(
    retentionDays: number,
  ): Promise<{ purged: number; bytesFreed: number; failed: number }> {
    const now = this.clock.now();
    const cutoff = this.clock.plusDays(-retentionDays);

    let purged = 0;
    let bytesFreed = 0;
    const unpurgeable: string[] = [];

    for (;;) {
      const profiles = await this.prisma.raw.voiceProfile.findMany({
        where: {
          originalAssetId: { not: null },
          ...(unpurgeable.length > 0 ? { id: { notIn: unpurgeable } } : {}),
          OR: [
            { rawRetentionUntil: { lte: now } },
            { original: { createdAt: { lte: cutoff } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: SWEEP_BATCH_SIZE,
      });
      if (profiles.length === 0) break;

      for (const profile of profiles) {
        try {
          const result = await this.voicePurge.purgeRawRecording(profile);
          purged += 1;
          bytesFreed += result.bytesFreed;

          await this.audit.record({
            action: RETENTION_AUDIT_ACTIONS.RAW_RECORDING_EXPIRED,
            subjectType: AUDIT_SUBJECTS.VOICE_PROFILE,
            subjectId: profile.id,
            metadata: {
              userId: profile.userId,
              retentionDays,
              bytesFreed: result.bytesFreed,
              ...(profile.originalAssetId ? { assetId: profile.originalAssetId } : {}),
            },
          });
        } catch (error) {
          // Skipped for the rest of this pass so one unreachable object cannot
          // hold up the queue behind it; tomorrow's sweep tries again.
          unpurgeable.push(profile.id);
          this.logger
            .child({ voiceProfileId: profile.id, userId: profile.userId })
            .error({ err: error }, 'expired voice recording could not be purged');
        }
      }
    }

    return { purged, bytesFreed, failed: unpurgeable.length };
  }

  /**
   * Uploads that were signed for but never confirmed.
   *
   * `AssetsService` records the row before handing out the URL precisely so an
   * abandoned upload is a row this sweep can find, rather than an object in the
   * bucket that nothing points at. The object may or may not have landed, so it
   * is deleted rather than assumed absent.
   */
  private async purgeAbandonedUploads(): Promise<{
    purged: number;
    bytesFreed: number;
    failed: number;
  }> {
    const abandonedBefore = new Date(this.clock.timestamp() - ABANDONED_UPLOAD_GRACE_MS);

    const result = await this.assetPurge.purgeWhere({
      uploadedAt: null,
      createdAt: { lte: abandonedBefore },
    });

    if (result.purged > 0) {
      await this.audit.record({
        action: RETENTION_AUDIT_ACTIONS.ABANDONED_UPLOADS_PURGED,
        subjectType: AUDIT_SUBJECTS.SWEEP,
        subjectId: abandonedBefore.toISOString(),
        metadata: { objectsPurged: result.purged, bytesFreed: result.bytesFreed },
      });
    }

    return { purged: result.purged, bytesFreed: result.bytesFreed, failed: result.failed };
  }
}
