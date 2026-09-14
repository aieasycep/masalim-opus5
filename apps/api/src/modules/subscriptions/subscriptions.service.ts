import { Inject, Injectable } from '@nestjs/common';
import type { SubscriptionProvider, SubscriptionState } from '@masalim/payments';
import type {
  EntitlementsResponse,
  SubscriptionDto,
  SubscriptionStore,
  SubscriptionTier,
} from '@masalim/types';
import { SUBSCRIPTION_PROVIDER } from '../../core/commerce/commerce.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { AppLogger } from '../../core/logger/logger.service';

/** Statuses that actually grant Premium features. */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionState['status']> = new Set([
  'ACTIVE',
  'TRIALING',
  // A billing retry is in progress. Cutting a family off mid-story because a
  // card expired would be a worse outcome than a few days of grace.
  'IN_GRACE_PERIOD',
  // Cancelled but paid up: access runs to the end of the period they bought.
  'CANCELLED',
]);

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(SUBSCRIPTION_PROVIDER) private readonly provider: SubscriptionProvider,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly logger: AppLogger,
  ) {}

  /** What the paywall and the usage meters render from. */
  async entitlementsFor(userId: string): Promise<EntitlementsResponse> {
    return this.entitlements.summaryFor(userId);
  }

  async current(userId: string): Promise<SubscriptionDto> {
    const subscription = await this.prisma.client.subscription.findUnique({ where: { userId } });
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    return {
      tier: user.subscriptionTier,
      status: subscription?.status ?? 'NONE',
      productId: subscription?.productId ?? null,
      startedAt: subscription?.startedAt?.toISOString() ?? null,
      expiresAt: subscription?.expiresAt?.toISOString() ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      willRenew: subscription?.willRenew ?? false,
      // Cancellation happens in the store, not here, so the app deep-links to
      // wherever the subscription was actually bought.
      managementUrl: this.managementUrlFor(subscription?.store ?? null),
    };
  }

  private managementUrlFor(store: SubscriptionStore | null): string | null {
    if (store === 'APP_STORE') return 'https://apps.apple.com/account/subscriptions';
    if (store === 'PLAY_STORE') {
      return 'https://play.google.com/store/account/subscriptions';
    }
    return null;
  }

  /**
   * Re-reads the subscription from the provider.
   *
   * Called when the app reports a purchase completed. The client's claim is only
   * a hint to look — the entitlement comes from the store via the provider, so a
   * forged request buys nothing.
   */
  async refresh(userId: string): Promise<SubscriptionDto> {
    const state = await this.provider.fetchState(userId);
    await this.applyState(userId, state, { type: 'REFRESH', payload: {} });
    return this.current(userId);
  }

  /**
   * Applies a verified state change.
   *
   * The user's tier is written alongside the subscription row in one
   * transaction: entitlement checks read the tier on every request, and a state
   * where the two disagree is a customer who paid and cannot use what they
   * bought.
   */
  async applyState(
    userId: string,
    state: SubscriptionState,
    event: { type: string; payload: Record<string, unknown>; providerEventId?: string },
  ): Promise<void> {
    const tier: SubscriptionTier = ENTITLING_STATUSES.has(state.status) ? 'PREMIUM' : 'FREE';

    await this.prisma.client.$transaction(async (tx) => {
      const subscription = await tx.subscription.upsert({
        where: { userId },
        create: {
          userId,
          provider: this.provider.name,
          store: state.store,
          ...(state.productId ? { productId: state.productId } : {}),
          entitlement: state.entitlement,
          status: state.status,
          ...(state.originalTransactionId
            ? { originalTransactionId: state.originalTransactionId }
            : {}),
          ...(state.startedAt ? { startedAt: state.startedAt } : {}),
          ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}),
          ...(state.trialEndsAt ? { trialEndsAt: state.trialEndsAt } : {}),
          willRenew: state.willRenew,
        },
        update: {
          store: state.store,
          productId: state.productId,
          entitlement: state.entitlement,
          status: state.status,
          originalTransactionId: state.originalTransactionId,
          startedAt: state.startedAt,
          expiresAt: state.expiresAt,
          trialEndsAt: state.trialEndsAt,
          willRenew: state.willRenew,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { subscriptionTier: tier, subscriptionStatus: state.status },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: event.type,
          payload: event.payload,
          ...(event.providerEventId ? { providerEventId: event.providerEventId } : {}),
        },
      });
    });

    this.logger
      .child({ userId })
      .info({ status: state.status, tier }, 'subscription state applied');
  }

  /**
   * Handles a store webhook.
   *
   * The provider verifies the signature; an unsigned or missigned request
   * returns null here and is answered with a 202 rather than an error, because
   * telling an attacker which of their forgeries was rejected is free
   * information and stores retry on anything that is not a success.
   */
  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ accepted: boolean }> {
    const event = this.provider.parseWebhook(rawBody, headers);
    if (!event) {
      this.logger.pino.warn('rejected a subscription webhook that did not verify');
      return { accepted: false };
    }

    const user = await this.prisma.client.user.findUnique({ where: { id: event.userId } });
    if (!user) {
      this.logger.pino.warn({ userId: event.userId }, 'webhook for an unknown user');
      return { accepted: false };
    }

    // A store retries until it gets a 2xx, so the same event arrives more than
    // once; the unique providerEventId is what keeps that from re-applying.
    const seen = await this.prisma.client.subscriptionEvent.findUnique({
      where: { providerEventId: event.eventId },
    });
    if (seen) {
      return { accepted: true };
    }

    await this.applyState(event.userId, event.state, {
      type: event.type,
      payload: event.redactedPayload,
      providerEventId: event.eventId,
    });

    return { accepted: true };
  }
}
