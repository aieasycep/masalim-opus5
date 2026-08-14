import { Injectable } from '@nestjs/common';
import {
  ENTITLEMENT_KEYS,
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AIJobDto,
  type NarrationDto,
  type NarrationSegment,
} from '@masalim/types';
import type { CreateNarrationInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { QueueService } from '../../core/queue/queue.service';
import { AppError } from '../../core/errors/app-error';
import { AssetsService } from '../assets/assets.service';
import { NarrationRenderService } from './narration-render.service';

@Injectable()
export class NarrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly rateLimit: RateLimitService,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly assets: AssetsService,
  ) {}

  /**
   * Queues a reading of an existing story.
   *
   * The story text is never regenerated — "Yeni Sesle Oluştur" gives the same
   * story a different narrator, and a parent who has already read and edited it
   * would be dismayed to find the words had changed (§23).
   *
   * This is also where the parent-voice paywall lands. It is deliberately *here*
   * and not at recording time: the Voice Studio told them up front that narrating
   * with their own voice is Premium, they were still allowed to record and hear
   * themselves, and the wall appears only when they try to use it for real (§36).
   */
  async create(
    userId: string,
    storyId: string,
    input: CreateNarrationInput,
  ): Promise<{ narration: NarrationDto; job: AIJobDto }> {
    await this.rateLimit.enforce(RATE_LIMIT_KEYS.NARRATION_HOURLY, userId);

    const story = await this.policy.assertStory(userId, storyId);
    if (story.status !== 'READY') {
      throw new AppError(ERROR_CODES.STORY_NOT_READY);
    }

    let provider: string;

    if (input.voiceProfileId) {
      const voice = await this.policy.assertVoiceProfile(userId, input.voiceProfileId);
      if (voice.status !== 'READY' || !voice.providerVoiceId) {
        throw new AppError(ERROR_CODES.VOICE_NOT_READY);
      }
      await this.entitlements.assertEntitled(userId, ENTITLEMENT_KEYS.PARENT_VOICE_CLONE);
      provider = voice.provider;
    } else if (input.systemVoiceId) {
      const systemVoice = await this.prisma.client.systemVoice.findUnique({
        where: { id: input.systemVoiceId },
      });
      if (!systemVoice || !systemVoice.enabled) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'System voice not available');
      }
      if (systemVoice.premiumOnly) {
        await this.entitlements.assertEntitled(userId, ENTITLEMENT_KEYS.PREMIUM_SYSTEM_VOICES);
      }
      provider = systemVoice.provider;
    } else {
      throw new AppError(ERROR_CODES.NARRATION_VOICE_REQUIRED);
    }

    await this.entitlements.consumeQuota(userId, ENTITLEMENT_KEYS.NARRATION_MONTHLY_LIMIT);

    const narration = await this.prisma.client.narration.create({
      data: {
        storyId: story.id,
        ...(input.voiceProfileId ? { voiceProfileId: input.voiceProfileId } : {}),
        ...(input.systemVoiceId ? { systemVoiceId: input.systemVoiceId } : {}),
        provider,
        status: 'PENDING',
        // Pinning the version means a narration always matches the words it was
        // made from, even after the parent edits the story afterwards.
        storyVersion: story.version,
        idempotencyKey: input.idempotencyKey,
      },
      include: { voiceProfile: true, systemVoice: true },
    });

    const job = await this.queue.enqueue({
      type: 'NARRATION_GENERATION',
      userId,
      entityType: 'narration',
      entityId: narration.id,
      totalSteps: NarrationRenderService.TOTAL_STEPS,
      idempotencyKey: input.idempotencyKey,
    });

    return { narration: await this.toDto(narration), job };
  }

  async list(userId: string, storyId: string): Promise<NarrationDto[]> {
    await this.policy.assertStory(userId, storyId);
    const narrations = await this.prisma.client.narration.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      include: { voiceProfile: true, systemVoice: true },
    });
    return Promise.all(narrations.map((narration) => this.toDto(narration)));
  }

  async findOne(userId: string, narrationId: string): Promise<NarrationDto> {
    await this.policy.assertNarration(userId, narrationId);
    const narration = await this.prisma.client.narration.findUniqueOrThrow({
      where: { id: narrationId },
      include: { voiceProfile: true, systemVoice: true },
    });
    return this.toDto(narration);
  }

  /** Sentence offsets for the reader's highlight-along mode. */
  async segments(userId: string, narrationId: string): Promise<NarrationSegment[]> {
    const narration = await this.policy.assertNarration(userId, narrationId);
    return (narration.segments as NarrationSegment[] | null) ?? [];
  }

  async remove(userId: string, narrationId: string): Promise<void> {
    const narration = await this.policy.assertNarration(userId, narrationId);
    if (narration.audioAssetId) {
      await this.assets.deleteAsset(narration.audioAssetId);
    }
    await this.prisma.client.narration.delete({ where: { id: narration.id } });
  }

  async toDto(narration: {
    id: string;
    storyId: string;
    status: NarrationDto['status'];
    audioAssetId: string | null;
    durationSeconds: number | null;
    voiceProfileId: string | null;
    systemVoiceId: string | null;
    createdAt: Date;
    voiceProfile?: { displayName: string } | null;
    systemVoice?: { displayName: string } | null;
  }): Promise<NarrationDto> {
    return {
      id: narration.id,
      storyId: narration.storyId,
      status: narration.status,
      audioUrl: await this.assets.signedUrlForAsset(narration.audioAssetId),
      durationSeconds: narration.durationSeconds,
      narratorLabel:
        narration.voiceProfile?.displayName ?? narration.systemVoice?.displayName ?? '',
      voiceProfileId: narration.voiceProfileId,
      systemVoiceId: narration.systemVoiceId,
      createdAt: narration.createdAt.toISOString(),
    };
  }
}
