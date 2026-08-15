import { Inject, Injectable } from '@nestjs/common';
import { ProviderError, type VoiceCloneProvider } from '@masalim/ai';
import { ERROR_CODES } from '@masalim/types';
import { VOICE_CLONE_PROVIDER } from '../../core/ai/ai.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetPurgeService, type AssetPurgeResult } from './asset-purge.service';

export interface VoiceProfilePurgeResult {
  /** False when the profile had already been purged by an earlier attempt. */
  found: boolean;
  clonesRemoved: number;
  assets: AssetPurgeResult;
}

interface PurgeableProfile {
  id: string;
  userId: string;
  providerVoiceId: string | null;
  originalAssetId: string | null;
  previewAssetId: string | null;
}

/**
 * Deleting a cloned voice everywhere it exists.
 *
 * Three things make up a parent's voice: the recording they read aloud, the
 * model the provider derived from it, and the preview we synthesised to prove
 * the clone worked. Removing only our rows would leave a third party holding a
 * usable model of a parent reading to their child, which is precisely what
 * "Sesimi Sil" promises will not happen.
 *
 * The provider goes first and its id is cleared the moment it confirms, so a
 * retry after a crash never re-issues a delete for a voice that is already gone
 * — and never skips one that is not.
 */
@Injectable()
export class VoicePurgeService {
  constructor(
    @Inject(VOICE_CLONE_PROVIDER) private readonly cloneProvider: VoiceCloneProvider,
    private readonly prisma: PrismaService,
    private readonly assetPurge: AssetPurgeService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The whole profile: provider model, recording, preview, then the row.
   *
   * The row is soft-deleted rather than dropped because narrations already
   * rendered in this voice keep a reference to it, and a family that recorded a
   * story last winter should not lose the audio because the voice was retired.
   */
  async purgeProfile(voiceProfileId: string): Promise<VoiceProfilePurgeResult> {
    const profile = await this.prisma.raw.voiceProfile.findUnique({
      where: { id: voiceProfileId },
    });

    // Already purged, or never existed: either way the requested end state
    // holds, and a repeat run has nothing to converge towards.
    if (!profile || (profile.deletedAt && !profile.providerVoiceId && !profile.originalAssetId)) {
      return { found: false, clonesRemoved: 0, assets: { purged: 0, failed: 0, bytesFreed: 0 } };
    }

    if (!profile.deletedAt) {
      await this.prisma.raw.voiceProfile.update({
        where: { id: profile.id },
        data: { status: 'DELETING' },
      });
    }

    const clonesRemoved = (await this.purgeClone(profile)) ? 1 : 0;

    const assets = await this.assetPurge.purgeByIds([
      profile.originalAssetId,
      profile.previewAssetId,
    ]);
    if (assets.failed > 0) {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Voice media could not be removed from storage',
      );
    }

    await this.prisma.raw.voiceProfile.update({
      where: { id: profile.id },
      data: {
        deletedAt: profile.deletedAt ?? this.clock.now(),
        originalAssetId: null,
        previewAssetId: null,
      },
    });

    return { found: true, clonesRemoved, assets };
  }

  /**
   * The raw training recording only, leaving the working clone in place.
   *
   * This is what the retention window enforces: the sample is what a parent
   * would least like kept, and once the model exists it is no longer needed to
   * narrate anything.
   */
  async purgeRawRecording(profile: {
    id: string;
    status: string;
    originalAssetId: string | null;
  }): Promise<AssetPurgeResult> {
    const assets = await this.assetPurge.purgeByIds([profile.originalAssetId]);
    if (assets.failed > 0) {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Expired voice recording could not be removed from storage',
      );
    }

    await this.prisma.raw.voiceProfile.update({
      where: { id: profile.id },
      data: {
        originalAssetId: null,
        rawRetentionUntil: null,
        // A profile whose clone never completed has just lost the only sample
        // it could have been built from; saying so lets the parent re-record
        // instead of waiting on a job that can no longer run.
        ...(profile.status === 'READY' ? {} : { status: 'AWAITING_RECORDING' as const }),
      },
    });

    return assets;
  }

  /**
   * Removes the model at the provider and forgets its id.
   *
   * Returns false when there was nothing to remove. Only an explicit not-found
   * counts as already gone: every other failure keeps `providerVoiceId` so the
   * next sweep tries again. Inferring "deleted" from an unclassified error is
   * how a parent's cloned voice ends up living at the provider forever with
   * nothing in our database still pointing at it — unreachable by us, and
   * undeletable on request.
   */
  async purgeClone(profile: PurgeableProfile): Promise<boolean> {
    if (!profile.providerVoiceId) return false;

    let removedNow = true;
    try {
      await this.cloneProvider.deleteVoice(profile.providerVoiceId);
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'not_found') {
        removedNow = false;
        this.logger
          .child({ voiceProfileId: profile.id, userId: profile.userId })
          .warn({ err: error }, 'provider has no such voice; the clone was already gone');
      } else {
        throw new AppError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          'The cloned voice could not be removed from the provider',
          { cause: error },
        );
      }
    }

    await this.prisma.raw.voiceProfile.update({
      where: { id: profile.id },
      data: { providerVoiceId: null },
    });

    return removedNow;
  }

  /** Every clone this account owns, including profiles already soft-deleted. */
  async purgeAllClonesForUser(userId: string): Promise<number> {
    const profiles = await this.prisma.raw.voiceProfile.findMany({
      where: { userId, providerVoiceId: { not: null } },
    });

    let removed = 0;
    for (const profile of profiles) {
      if (await this.purgeClone(profile)) removed += 1;
    }
    return removed;
  }
}
