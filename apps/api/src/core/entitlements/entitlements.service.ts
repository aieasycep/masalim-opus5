import { Injectable } from '@nestjs/common';
import {
  ENTITLEMENTS,
  ERROR_CODES,
  QUOTA_KEYS,
  type EntitlementKey,
  type EntitlementSet,
  type EntitlementsResponse,
  type QuotaKey,
  type SubscriptionTier,
} from '@masalim/types';
import { monthlyPeriod } from '@masalim/database';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../errors/app-error';
import { Clock } from '../time/clock';

/**
 * Entitlements and quotas, enforced server-side.
 *
 * The mobile app reads the same numbers to decide what to show, but the gate is
 * here: a premium endpoint is protected whether or not the client hid the
 * button (master prompt §35, §77).
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async tierFor(userId: string): Promise<SubscriptionTier> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    return user?.subscriptionTier ?? 'FREE';
  }

  async entitlementsFor(userId: string): Promise<EntitlementSet> {
    return ENTITLEMENTS[await this.tierFor(userId)];
  }

  /** Throw unless the caller's tier grants a boolean entitlement. */
  async assertEntitled(userId: string, key: EntitlementKey): Promise<void> {
    const entitlements = await this.entitlementsFor(userId);
    const value = entitlements[key];
    if (value === false || value === 0) {
      throw new AppError(ERROR_CODES.PREMIUM_REQUIRED, `Entitlement ${key} required`, {
        logContext: { entitlement: key },
      });
    }
  }

  async usageFor(userId: string, quota: QuotaKey): Promise<number> {
    const { start } = monthlyPeriod(this.clock.now());
    const counter = await this.prisma.client.usageCounter.findUnique({
      where: { userId_feature_periodStart: { userId, feature: quota, periodStart: start } },
    });
    return counter?.used ?? 0;
  }

  /**
   * Reserve one unit of a monthly quota.
   *
   * The check and the increment happen in a single transaction so two
   * simultaneous requests cannot both slip past the limit.
   */
  async consumeQuota(userId: string, quota: QuotaKey): Promise<void> {
    const limit = (await this.entitlementsFor(userId))[quota];
    const { start, end } = monthlyPeriod(this.clock.now());

    await this.prisma.client.$transaction(async (tx) => {
      const counter = await tx.usageCounter.upsert({
        where: { userId_feature_periodStart: { userId, feature: quota, periodStart: start } },
        create: { userId, feature: quota, periodStart: start, periodEnd: end, used: 0 },
        update: {},
      });

      if (counter.used >= limit) {
        throw new AppError(ERROR_CODES.QUOTA_EXCEEDED, `Quota ${quota} exhausted`, {
          logContext: { quota, limit, used: counter.used },
        });
      }

      await tx.usageCounter.update({
        where: { id: counter.id },
        data: { used: { increment: 1 } },
      });
    });
  }

  /** Give a quota unit back when the work it was reserved for never happened. */
  async refundQuota(userId: string, quota: QuotaKey): Promise<void> {
    const { start } = monthlyPeriod(this.clock.now());
    await this.prisma.client.usageCounter
      .update({
        where: { userId_feature_periodStart: { userId, feature: quota, periodStart: start } },
        data: { used: { decrement: 1 } },
      })
      .catch(() => undefined);
  }

  async summaryFor(userId: string): Promise<EntitlementsResponse> {
    const tier = await this.tierFor(userId);
    const entitlements = ENTITLEMENTS[tier];
    const { start, end } = monthlyPeriod(this.clock.now());

    const counters = await this.prisma.client.usageCounter.findMany({
      where: { userId, periodStart: start },
    });
    const usedByFeature = new Map(counters.map((counter) => [counter.feature, counter.used]));

    const usage = {} as EntitlementsResponse['usage'];
    for (const quota of QUOTA_KEYS) {
      usage[quota] = {
        used: usedByFeature.get(quota) ?? 0,
        limit: entitlements[quota],
        resetsAt: new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    return { tier, entitlements, usage };
  }
}
