import { Injectable } from '@nestjs/common';
import { ERROR_CODES, SIGNED_URL_DEFAULT_TTL_SECONDS, type UserDto } from '@masalim/types';
import type {
  AudioPreferencesInput,
  NotificationPreferencesInput,
  RequestAccountDeletionInput,
  UpdateProfileInput,
} from '@masalim/validation';
import type { DeletionRequestDto } from '@masalim/types';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AppLogger } from '../../core/logger/logger.service';
import { AssetsService } from '../assets/assets.service';

/** Grace period before an account deletion is executed, so it can be undone. */
const DELETION_GRACE_DAYS = 7;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async findMe(userId: string): Promise<UserDto> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found');
    }

    const avatarUrl = user.avatarAssetId
      ? await this.assets.signedUrlForAsset(user.avatarAssetId, SIGNED_URL_DEFAULT_TTL_SECONDS)
      : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl,
      locale: user.locale,
      timezone: user.timezone,
      onboardingCompleted: user.onboardingCompleted,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    if (input.avatarAssetId) {
      // Confirms the asset belongs to this user before it becomes their avatar.
      await this.policy.assertAsset(userId, input.avatarAssetId);
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarAssetId !== undefined ? { avatarAssetId: input.avatarAssetId } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });

    return this.findMe(userId);
  }

  async completeOnboarding(userId: string): Promise<UserDto> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
    return this.findMe(userId);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferencesInput> {
    const prefs = await this.prisma.client.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return {
      storyReady: prefs.storyReady,
      voiceReady: prefs.voiceReady,
      illustrationsReady: prefs.illustrationsReady,
      orderUpdates: prefs.orderUpdates,
      productNews: prefs.productNews,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    input: NotificationPreferencesInput,
  ): Promise<NotificationPreferencesInput> {
    await this.prisma.client.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return input;
  }

  async getAudioPreferences(userId: string): Promise<AudioPreferencesInput> {
    const prefs = await this.prisma.client.audioPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const rate = Number(prefs.defaultPlaybackRate);
    return {
      defaultPlaybackRate: rate === 0.8 ? 0.8 : rate === 1.2 ? 1.2 : 1,
      autoPlayNext: prefs.autoPlayNext,
      defaultSleepTimerMinutes: prefs.defaultSleepTimerMinutes,
    };
  }

  async updateAudioPreferences(
    userId: string,
    input: AudioPreferencesInput,
  ): Promise<AudioPreferencesInput> {
    await this.prisma.client.audioPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return input;
  }

  /**
   * Schedules account deletion.
   *
   * The account is soft-deleted immediately so it stops working right away, but
   * the irreversible purge runs after a grace period, giving a parent who tapped
   * by mistake a way back. The worker performs the real deletion, including the
   * provider-side voice models.
   */
  async requestAccountDeletion(
    userId: string,
    input: RequestAccountDeletionInput,
  ): Promise<DeletionRequestDto> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found');
    }
    if (user.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Confirmation email does not match', {
        details: [{ path: 'confirmEmail', code: 'EMAIL_MISMATCH' }],
      });
    }

    const existing = await this.prisma.client.deletionRequest.findFirst({
      where: { userId, type: 'ACCOUNT', status: { in: ['SCHEDULED', 'PROCESSING'] } },
    });
    if (existing) {
      return this.toDeletionDto(existing);
    }

    const request = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.deletionRequest.create({
        data: {
          userId,
          type: 'ACCOUNT',
          scheduledFor: this.clock.plusDays(DELETION_GRACE_DAYS),
          ...(input.reason ? { reason: input.reason } : {}),
        },
      });
      await tx.user.update({ where: { id: userId }, data: { deletedAt: this.clock.now() } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      });
      return created;
    });

    this.logger.child({ userId }).warn('account deletion scheduled');
    return this.toDeletionDto(request);
  }

  async listDeletionRequests(userId: string): Promise<DeletionRequestDto[]> {
    const requests = await this.prisma.raw.deletionRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((request) => this.toDeletionDto(request));
  }

  private toDeletionDto(request: {
    id: string;
    type: string;
    status: string;
    scheduledFor: Date;
    completedAt: Date | null;
    createdAt: Date;
  }): DeletionRequestDto {
    return {
      id: request.id,
      type: request.type as DeletionRequestDto['type'],
      status: request.status as DeletionRequestDto['status'],
      scheduledFor: request.scheduledFor.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    };
  }
}
