import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ENTITLEMENT_KEYS,
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AIJobDto,
  type Locale,
  type NarratorOption,
  type SystemVoiceDto,
  type VoiceProfileDto,
} from '@masalim/types';
import {
  VOICE_CONSENT_VERSION,
  type CreateVoiceProfileInput,
  type RenameVoiceProfileInput,
  type SubmitVoiceRecordingInput,
} from '@masalim/validation';
import type { VoiceCloneProvider } from '@masalim/ai';
import { analyseVoiceSample, type AudioQualityReport } from '@masalim/audio';
import { extensionForContentType } from '@masalim/storage';
import { VOICE_CLONE_PROVIDER } from '../../core/ai/ai.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { QueueService } from '../../core/queue/queue.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { VoiceCloneService } from './voice-clone.service';

/** Steps in the enrolment text the parent reads aloud, kept beside the consent copy. */
export interface VoiceConsentState {
  version: string;
  acceptedAt: string | null;
}

@Injectable()
export class VoicesService {
  constructor(
    @Inject(VOICE_CLONE_PROVIDER) private readonly cloneProvider: VoiceCloneProvider,
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly rateLimit: RateLimitService,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Records the parent's consent.
   *
   * Stored with the exact wording version, the moment, and a hash of the address
   * it came from. Kept separately from the voice profile because consent must
   * survive the profile being deleted — it is the record that the recording was
   * ever authorised (§21).
   */
  async acceptConsent(userId: string, ipAddress: string | null): Promise<VoiceConsentState> {
    const record = await this.prisma.client.voiceConsent.create({
      data: {
        userId,
        version: VOICE_CONSENT_VERSION,
        acceptedAt: this.clock.now(),
        ...(ipAddress ? { ipHash: this.hashIp(ipAddress) } : {}),
      },
    });

    return { version: record.version, acceptedAt: record.acceptedAt.toISOString() };
  }

  async currentConsent(userId: string): Promise<VoiceConsentState> {
    const record = await this.latestConsent(userId);
    return {
      version: VOICE_CONSENT_VERSION,
      acceptedAt: record?.acceptedAt.toISOString() ?? null,
    };
  }

  /**
   * Creates the profile the recording will be attached to.
   *
   * The consent row is re-checked here rather than trusting the flag in the
   * request: the frontend checkbox is a courtesy, not the gate.
   */
  async create(userId: string, input: CreateVoiceProfileInput): Promise<VoiceProfileDto> {
    await this.assertConsented(userId);

    const limit = (await this.entitlements.entitlementsFor(userId))[
      ENTITLEMENT_KEYS.VOICE_PROFILE_LIMIT
    ];
    const existing = await this.prisma.client.voiceProfile.count({ where: { userId } });
    if (existing >= limit) {
      throw new AppError(ERROR_CODES.VOICE_PROFILE_LIMIT_REACHED, `Limit of ${limit} reached`);
    }

    const consent = await this.latestConsent(userId);

    const profile = await this.prisma.client.voiceProfile.create({
      data: {
        userId,
        ownerType: input.ownerType,
        displayName: input.displayName,
        provider: this.cloneProvider.name,
        status: 'AWAITING_RECORDING',
        ...(consent
          ? {
              consentAcceptedAt: consent.acceptedAt,
              consentVersion: consent.version,
              ...(consent.ipHash ? { consentIpHash: consent.ipHash } : {}),
            }
          : {}),
      },
    });

    return this.toDto(profile);
  }

  /**
   * Accepts the confirmed recording and queues the clone.
   *
   * Quality control runs inline, before the job exists, so a parent who was too
   * far from the microphone is told immediately and can re-record — rather than
   * watching a progress bar for a minute to be told the same thing.
   */
  async submitRecording(
    userId: string,
    voiceProfileId: string,
    input: SubmitVoiceRecordingInput,
  ): Promise<{ voice: VoiceProfileDto; job: AIJobDto }> {
    await this.rateLimit.enforceAll(
      [RATE_LIMIT_KEYS.VOICE_CLONE_DAILY, RATE_LIMIT_KEYS.VOICE_CLONE_WEEKLY],
      userId,
    );

    const profile = await this.policy.assertVoiceProfile(userId, voiceProfileId);
    await this.assertConsented(userId);

    if (profile.status === 'PROCESSING' || profile.status === 'READY') {
      throw new AppError(ERROR_CODES.CONFLICT, 'This voice already has a recording');
    }

    const asset = await this.policy.assertAsset(userId, input.assetId);
    if (asset.kind !== 'VOICE_RECORDING') {
      throw new AppError(ERROR_CODES.UPLOAD_TYPE_NOT_ALLOWED, 'Asset is not a voice recording');
    }
    if (!asset.uploadedAt) {
      throw new AppError(ERROR_CODES.UPLOAD_FAILED, 'Recording upload was never confirmed');
    }

    const report = await this.qualityControl(asset.id, asset.contentType);
    if (!report.acceptable && report.issue) {
      await this.prisma.client.voiceProfile.update({
        where: { id: profile.id },
        data: { status: 'AWAITING_RECORDING', processingErrorCode: report.issue },
      });
      throw new AppError(report.issue, 'Recording did not pass quality control', {
        logContext: { metrics: report.metrics },
      });
    }

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: {
        originalAssetId: asset.id,
        status: 'UPLOADED',
        processingErrorCode: null,
      },
    });

    const job = await this.queue.enqueue({
      type: 'VOICE_CLONE',
      userId,
      entityType: 'voiceProfile',
      entityId: profile.id,
      totalSteps: VoiceCloneService.TOTAL_STEPS,
      idempotencyKey: input.idempotencyKey,
    });

    return { voice: await this.findOne(userId, profile.id), job };
  }

  async list(userId: string): Promise<VoiceProfileDto[]> {
    const profiles = await this.prisma.client.voiceProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(profiles.map((profile) => this.toDto(profile)));
  }

  async findOne(userId: string, voiceProfileId: string): Promise<VoiceProfileDto> {
    const profile = await this.policy.assertVoiceProfile(userId, voiceProfileId);
    return this.toDto(profile);
  }

  async rename(
    userId: string,
    voiceProfileId: string,
    input: RenameVoiceProfileInput,
  ): Promise<VoiceProfileDto> {
    await this.policy.assertVoiceProfile(userId, voiceProfileId);
    const updated = await this.prisma.client.voiceProfile.update({
      where: { id: voiceProfileId },
      data: { displayName: input.displayName },
    });
    return this.toDto(updated);
  }

  /**
   * Deletes a voice everywhere.
   *
   * The provider-side voice goes first: a parent who deletes their voice means
   * it is gone, not hidden behind our UI while a third party still holds a clone
   * of them reading to their child (§46). The local rows only follow once that
   * has succeeded, so a provider outage leaves something to retry rather than a
   * dangling clone nobody can reach.
   */
  async remove(userId: string, voiceProfileId: string): Promise<void> {
    const profile = await this.policy.assertVoiceProfile(userId, voiceProfileId);

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: { status: 'DELETING' },
    });

    if (profile.providerVoiceId) {
      try {
        await this.cloneProvider.deleteVoice(profile.providerVoiceId);
      } catch (error) {
        await this.prisma.client.voiceProfile.update({
          where: { id: profile.id },
          data: { status: profile.status },
        });
        this.logger
          .child({ userId, voiceProfileId })
          .error({ err: error }, 'provider voice deletion failed');
        throw new AppError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          'The voice could not be removed from the provider',
        );
      }
    }

    if (profile.originalAssetId) {
      await this.assets.deleteAsset(profile.originalAssetId);
    }
    if (profile.previewAssetId) {
      await this.assets.deleteAsset(profile.previewAssetId);
    }

    await this.prisma.client.voiceProfile.update({
      where: { id: profile.id },
      data: {
        deletedAt: this.clock.now(),
        providerVoiceId: null,
        originalAssetId: null,
        previewAssetId: null,
      },
    });
  }

  /** The narrator picker: the parent's own voices plus the system ones they may use. */
  async narratorOptions(userId: string): Promise<NarratorOption[]> {
    const [profiles, systemVoices, entitlements] = await Promise.all([
      this.prisma.client.voiceProfile.findMany({
        where: { userId, status: 'READY' },
        orderBy: { createdAt: 'asc' },
      }),
      this.listSystemVoices(),
      this.entitlements.entitlementsFor(userId),
    ]);

    const parentOptions: NarratorOption[] = entitlements[ENTITLEMENT_KEYS.PARENT_VOICE_CLONE]
      ? await Promise.all(
          profiles.map(async (profile) => ({
            kind: 'PARENT' as const,
            voice: await this.toDto(profile),
          })),
        )
      : [];

    return [...parentOptions, ...systemVoices.map((voice) => ({ kind: 'SYSTEM' as const, voice }))];
  }

  /**
   * System narrators.
   *
   * Premium ones are still listed for free accounts — the picker shows them with
   * a lock so the upgrade is visible rather than hidden, which is the opposite
   * of a surprise paywall.
   */
  async listSystemVoices(): Promise<SystemVoiceDto[]> {
    const voices = await this.prisma.client.systemVoice.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });

    return Promise.all(
      voices.map(async (voice) => ({
        id: voice.id,
        slug: voice.slug,
        displayName: voice.displayName,
        descriptionKey: voice.descriptionKey,
        category: voice.category,
        previewUrl: await this.assets.signedUrlForAsset(voice.previewAssetId),
        premiumOnly: voice.premiumOnly,
      })),
    );
  }

  async toDto(profile: {
    id: string;
    ownerType: VoiceProfileDto['ownerType'];
    displayName: string;
    status: VoiceProfileDto['status'];
    previewAssetId: string | null;
    consentAcceptedAt: Date | null;
    processingErrorCode: string | null;
    createdAt: Date;
  }): Promise<VoiceProfileDto> {
    return {
      id: profile.id,
      ownerType: profile.ownerType,
      displayName: profile.displayName,
      status: profile.status,
      previewUrl: await this.assets.signedUrlForAsset(profile.previewAssetId),
      consentAcceptedAt: profile.consentAcceptedAt?.toISOString() ?? null,
      errorCode: profile.status === 'FAILED' ? profile.processingErrorCode : null,
      createdAt: profile.createdAt.toISOString(),
    };
  }

  async localeFor(userId: string): Promise<Locale> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    return user?.locale ?? 'tr';
  }

  private async latestConsent(userId: string) {
    return this.prisma.client.voiceConsent.findFirst({
      where: { userId, version: VOICE_CONSENT_VERSION, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  private async assertConsented(userId: string): Promise<void> {
    const consent = await this.latestConsent(userId);
    if (!consent) {
      throw new AppError(
        ERROR_CODES.VOICE_CONSENT_REQUIRED,
        `Consent ${VOICE_CONSENT_VERSION} has not been recorded`,
      );
    }
  }

  private async qualityControl(
    assetId: string,
    contentType: string,
  ): Promise<AudioQualityReport> {
    const body = await this.assets.readAsset(assetId);
    return analyseVoiceSample(body, extensionForContentType(contentType));
  }

  /**
   * Consent addresses are stored as a salted hash.
   *
   * The audit trail needs to show the acceptance came from a real session, not
   * to keep a log of where a family lives.
   */
  private hashIp(ipAddress: string): string {
    return createHash('sha256').update(`masalim:voice-consent:${ipAddress}`).digest('hex');
  }
}
