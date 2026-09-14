import { Inject, Injectable } from '@nestjs/common';
import type { PushProvider, PushRecipient } from '@masalim/notifications';
import { createTranslator } from '@masalim/localization';
import {
  buildDeepLink,
  ERROR_CODES,
  type DeepLinkHost,
  type Locale,
  type NotificationDto,
  type NotificationType,
} from '@masalim/types';
import type { RegisterDeviceInput } from '@masalim/validation';
import { PUSH_PROVIDER } from '../../core/notifications/push.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';

export interface NotifyParams {
  userId: string;
  type: NotificationType;
  /** Localisation keys, resolved per device language at send time. */
  titleKey: string;
  bodyKey: string;
  values?: Record<string, string>;
  link: { host: DeepLinkHost; id?: string };
}

/**
 * Which preference switch governs which notification.
 *
 * Explicit rather than derived from the type name: a parent who turns off order
 * updates must not stop hearing that their story is ready. Subscription events
 * map to `null` — they are account-critical, not something to be opted out of,
 * and a family whose Premium lapsed silently would simply find features gone.
 */
type PreferenceKey = 'storyReady' | 'voiceReady' | 'illustrationsReady' | 'orderUpdates';

const PREFERENCE_BY_TYPE: Readonly<Record<NotificationType, PreferenceKey | null>> = {
  STORY_READY: 'storyReady',
  STORY_FAILED: 'storyReady',
  VOICE_READY: 'voiceReady',
  VOICE_FAILED: 'voiceReady',
  ILLUSTRATIONS_READY: 'illustrationsReady',
  BOOK_READY: 'illustrationsReady',
  ORDER_CONFIRMED: 'orderUpdates',
  ORDER_SHIPPED: 'orderUpdates',
  ORDER_DELIVERED: 'orderUpdates',
  SUBSCRIPTION_RENEWED: null,
  SUBSCRIPTION_EXPIRED: null,
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async registerDevice(userId: string, input: RegisterDeviceInput): Promise<void> {
    const appVersion = input.appVersion ?? null;

    await this.prisma.client.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        appVersion,
        locale: input.locale,
        lastSeenAt: this.clock.now(),
      },
      update: {
        // A token can move between accounts when a phone changes hands; the
        // owner is whoever most recently signed in on it.
        userId,
        platform: input.platform,
        appVersion,
        locale: input.locale,
        lastSeenAt: this.clock.now(),
        disabledAt: null,
      },
    });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.prisma.client.deviceToken.updateMany({
      where: { userId, token },
      data: { disabledAt: this.clock.now() },
    });
  }

  /**
   * Records a notification and pushes it to the parent's devices.
   *
   * The row is written whether or not a push goes out: the in-app list is the
   * durable record, and push is best-effort delivery on top of it. A parent who
   * had notifications switched off still finds out their story is ready when
   * they next open the app.
   */
  async notify(params: NotifyParams): Promise<void> {
    const deepLink = buildDeepLink(params.link.host, params.link.id);

    await this.prisma.client.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        titleKey: params.titleKey,
        bodyKey: params.bodyKey,
        data: { ...(params.values ?? {}), deepLink },
      },
    });

    if (!(await this.wantsPush(params.userId, params.type))) return;

    const devices = await this.prisma.client.deviceToken.findMany({
      where: { userId: params.userId, disabledAt: null },
    });
    if (devices.length === 0) return;

    const recipients: PushRecipient[] = devices.map((device) => ({
      token: device.token,
      platform: device.platform,
      locale: device.locale,
    }));

    // Devices can be set to different languages; each gets its own copy rather
    // than everyone getting the account default.
    const byLocale = new Map<Locale, PushRecipient[]>();
    for (const recipient of recipients) {
      const group = byLocale.get(recipient.locale) ?? [];
      group.push(recipient);
      byLocale.set(recipient.locale, group);
    }

    for (const [locale, group] of byLocale) {
      const translator = createTranslator(locale);
      const results = await this.push.send(group, {
        type: params.type,
        title: translator.t(params.titleKey, params.values),
        body: translator.t(params.bodyKey, params.values),
        deepLink,
      });

      const dead = results.filter((result) => result.permanentlyInvalid).map((r) => r.token);
      if (dead.length > 0) {
        await this.prisma.client.deviceToken.updateMany({
          where: { token: { in: dead } },
          data: { disabledAt: this.clock.now() },
        });
      }
    }

    this.logger
      .child({ userId: params.userId })
      .info({ type: params.type, devices: devices.length }, 'notification sent');
  }

  async list(userId: string, limit: number): Promise<NotificationDto[]> {
    const rows = await this.prisma.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      data: (row.data ?? {}) as Record<string, string>,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const updated = await this.prisma.client.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: this.clock.now() },
    });
    if (updated.count === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'No such notification');
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.client.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: this.clock.now() },
    });
  }

  private async wantsPush(userId: string, type: NotificationType): Promise<boolean> {
    const key = PREFERENCE_BY_TYPE[type];
    if (key === null) return true;

    const preferences = await this.prisma.client.notificationPreference.findUnique({
      where: { userId },
    });
    // No row yet means the parent has not been to the settings screen; the
    // defaults in the schema are what they would find there.
    return preferences ? preferences[key] : true;
  }
}
