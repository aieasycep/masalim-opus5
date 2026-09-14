import { Inject, Injectable } from '@nestjs/common';
import { ProviderError, type TextToSpeechProvider, type VoiceCloneProvider } from '@masalim/ai';
import { ERROR_CODES, type ErrorCode } from '@masalim/types';
import { TTS_PROVIDER, VOICE_CLONE_PROVIDER } from '../../core/ai/ai.module';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/config.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JobStepReporter } from '../../core/queue/queue.constants';

/** The sentence the parent hears played back in their own voice. */
const PREVIEW_TEXT =
  'Merhaba, ben senin sesinim. Bu akşam sana çok güzel bir masal okuyacağım.';

export interface CloneVoiceParams {
  voiceProfileId: string;
  userId: string;
  jobId: string;
}

@Injectable()
export class VoiceCloneService {
  static readonly TOTAL_STEPS = 3;

  constructor(
    @Inject(VOICE_CLONE_PROVIDER) private readonly clone: VoiceCloneProvider,
    @Inject(TTS_PROVIDER) private readonly tts: TextToSpeechProvider,
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly notifications: NotificationsService,
    private readonly usage: AiUsageTracker,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async run(params: CloneVoiceParams, reporter: JobStepReporter): Promise<void> {
    const log = this.logger.child({
      voiceProfileId: params.voiceProfileId,
      userId: params.userId,
      jobId: params.jobId,
    });

    const profile = await this.prisma.client.voiceProfile.findUnique({
      where: { id: params.voiceProfileId },
    });
    if (!profile || profile.deletedAt) {
      throw new AppError(ERROR_CODES.VOICE_PROFILE_NOT_FOUND);
    }
    if (!profile.originalAssetId) {
      throw new AppError(
        ERROR_CODES.VOICE_PROCESSING_FAILED,
        'No recording attached to the profile',
      );
    }

    // Consent is re-checked at the point of use, not only at the point of
    // collection: a parent who withdrew it between uploading and the job
    // running must not have their voice cloned anyway.
    const consent = await this.prisma.client.voiceConsent.findFirst({
      where: { userId: params.userId, version: profile.consentVersion ?? '', revokedAt: null },
    });
    if (!consent) {
      await this.markFailed(profile.id, ERROR_CODES.VOICE_CONSENT_REQUIRED);
      throw new AppError(ERROR_CODES.VOICE_CONSENT_REQUIRED);
    }

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: { status: 'PROCESSING', processingErrorCode: null },
    });

    // ---- Step 1: hand the sample to the provider --------------------------
    await reporter.step('job.voice.cloning', 1);

    const asset = await this.prisma.client.asset.findUniqueOrThrow({
      where: { id: profile.originalAssetId },
    });
    const sample = await this.assets.readAsset(asset.id);

    let providerVoiceId: string;
    try {
      const result = await this.clone.createVoice({
        displayName: `${profile.displayName} (${profile.id.slice(-6)})`,
        sample,
        sampleContentType: asset.contentType,
        language: 'tr',
      });
      providerVoiceId = result.data.providerVoiceId;
      await this.usage.record({
        userId: params.userId,
        jobId: params.jobId,
        operation: 'voice:clone',
        success: true,
        usage: result.usage,
      });
    } catch (error) {
      const code = this.toErrorCode(error);
      await this.markFailed(profile.id, code);
      throw new AppError(code, 'Voice cloning failed', { cause: error });
    }

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: { providerVoiceId },
    });

    // ---- Step 2: prove it works by synthesising the preview ---------------
    await reporter.step('job.voice.preview', 2);

    let previewAssetId: string | null = null;
    try {
      const speech = await this.tts.synthesise({
        text: PREVIEW_TEXT,
        providerVoiceId,
        language: 'tr',
      });
      const stored = await this.assets.createInternalAsset({
        userId: params.userId,
        kind: 'VOICE_PREVIEW',
        body: speech.data.audio,
        contentType: speech.data.contentType,
      });
      previewAssetId = stored.id;
      await this.usage.record({
        userId: params.userId,
        jobId: params.jobId,
        operation: 'voice:preview',
        success: true,
        usage: speech.usage,
      });
    } catch (error) {
      // The clone itself succeeded, so this is not fatal — the parent can still
      // use the voice, they just do not get the sample played back.
      log.warn({ err: error }, 'preview synthesis failed; voice is still usable');
    }

    // ---- Step 3: publish --------------------------------------------------
    await reporter.step('job.voice.finishing', 3);

    const retentionDays = this.config.get('VOICE_RAW_RETENTION_DAYS');

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: {
        status: 'READY',
        ...(previewAssetId ? { previewAssetId } : {}),
        // The raw recording is kept for a window rather than deleted at once:
        // if the clone turns out badly the parent can be re-cloned from it
        // without reading the sixty-second text again (§46).
        rawRetentionUntil: this.clock.plusSeconds(retentionDays * 24 * 60 * 60),
      },
    });

    await this.notifications.notify({
      userId: params.userId,
      type: 'VOICE_READY',
      titleKey: 'notification.voiceReady.title',
      bodyKey: 'notification.voiceReady.body',
      values: { name: profile.displayName },
      link: { host: 'voice', id: profile.id },
    });

    log.info({ hasPreview: previewAssetId !== null }, 'voice cloned');
  }

  private async markFailed(voiceProfileId: string, code: ErrorCode): Promise<void> {
    await this.prisma.client.voiceProfile
      .update({
        where: { id: voiceProfileId },
        data: { status: 'FAILED', processingErrorCode: code },
      })
      .catch(() => undefined);
  }

  private toErrorCode(error: unknown): ErrorCode {
    if (error instanceof ProviderError && error.kind === 'unauthorized') {
      return ERROR_CODES.SERVICE_UNAVAILABLE;
    }
    return ERROR_CODES.VOICE_PROCESSING_FAILED;
  }
}
