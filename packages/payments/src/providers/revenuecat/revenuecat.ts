import { timingSafeEqual } from 'node:crypto';
import type { SubscriptionStatus, SubscriptionStore } from '@masalim/types';
import type {
  SubscriptionProvider,
  SubscriptionState,
  SubscriptionWebhookEvent,
} from '../../types';
import { PaymentProviderError } from '../../types';

export interface RevenueCatConfig {
  /** Secret API key (`sk_…`), server-side only. Never in the mobile bundle. */
  apiKey: string;
  /** Shared secret configured on the webhook, sent as the Authorization header. */
  webhookSecret: string;
  entitlementId: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.revenuecat.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

interface RevenueCatEntitlement {
  expires_date?: string | null;
  purchase_date?: string | null;
  product_identifier?: string;
  grace_period_expires_date?: string | null;
}

interface RevenueCatSubscription {
  store?: string;
  original_purchase_date?: string | null;
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  period_type?: string;
}

interface RevenueCatSubscriber {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
    subscriptions?: Record<string, RevenueCatSubscription>;
    original_app_user_id?: string;
  };
}

interface RevenueCatWebhookBody {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    product_id?: string;
    period_type?: string;
    store?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    original_transaction_id?: string;
    cancel_reason?: string;
  };
}

const INACTIVE: SubscriptionState = {
  status: 'NONE',
  store: 'MOCK',
  productId: null,
  entitlement: 'premium',
  originalTransactionId: null,
  startedAt: null,
  expiresAt: null,
  trialEndsAt: null,
  willRenew: false,
};

/**
 * RevenueCat, the source of truth for store subscriptions.
 *
 * The mobile app never tells the backend it is Premium. It completes a purchase
 * with the store, RevenueCat reconciles the receipt, and this reads the result —
 * either from a signed webhook or by asking directly. A client-asserted
 * entitlement would be trivially forgeable.
 */
export class RevenueCatSubscriptionProvider implements SubscriptionProvider {
  readonly name = 'revenuecat';
  private readonly baseUrl: string;

  constructor(private readonly config: RevenueCatConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async fetchState(userId: string): Promise<SubscriptionState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${this.baseUrl}/subscribers/${encodeURIComponent(userId)}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        },
      );

      if (response.status === 404) return INACTIVE;
      if (response.status === 401 || response.status === 403) {
        throw new PaymentProviderError('RevenueCat rejected the API key', 'unauthorized');
      }
      if (!response.ok) {
        throw new PaymentProviderError('RevenueCat is unavailable', 'unavailable');
      }

      return this.toState((await response.json()) as RevenueCatSubscriber);
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError('RevenueCat request failed', 'unknown', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): SubscriptionWebhookEvent | null {
    if (!this.authorised(headers.authorization)) {
      return null;
    }

    let body: RevenueCatWebhookBody;
    try {
      body = JSON.parse(rawBody) as RevenueCatWebhookBody;
    } catch {
      return null;
    }

    const event = body.event;
    if (!event?.id || !event.app_user_id || !event.type) {
      return null;
    }

    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const startedAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : null;
    const isTrial = event.period_type === 'TRIAL';

    return {
      eventId: event.id,
      type: event.type,
      userId: event.app_user_id,
      state: {
        status: this.statusFromEvent(event.type, isTrial),
        store: this.storeFrom(event.store),
        productId: event.product_id ?? null,
        entitlement: this.config.entitlementId,
        originalTransactionId: event.original_transaction_id ?? null,
        startedAt,
        expiresAt,
        trialEndsAt: isTrial ? expiresAt : null,
        willRenew: !['CANCELLATION', 'EXPIRATION', 'SUBSCRIPTION_PAUSED'].includes(event.type),
      },
      redactedPayload: {
        provider: this.name,
        type: event.type,
        productId: event.product_id,
        store: event.store,
        periodType: event.period_type,
        cancelReason: event.cancel_reason,
      },
    };
  }

  /**
   * Constant-time comparison of the webhook secret.
   *
   * A plain `===` leaks the secret one byte at a time to anyone willing to
   * measure; the endpoint is public by necessity.
   */
  private authorised(header: string | undefined): boolean {
    if (!header) return false;
    const expected = Buffer.from(this.config.webhookSecret);
    const received = Buffer.from(header);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }

  private statusFromEvent(type: string, isTrial: boolean): SubscriptionStatus {
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
        return isTrial ? 'TRIALING' : 'ACTIVE';
      case 'CANCELLATION':
        // Cancelled but paid up: access continues until the period ends, which
        // is what the customer paid for.
        return 'CANCELLED';
      case 'BILLING_ISSUE':
        return 'IN_GRACE_PERIOD';
      case 'SUBSCRIPTION_PAUSED':
        return 'PAUSED';
      case 'EXPIRATION':
        return 'EXPIRED';
      default:
        return 'NONE';
    }
  }

  private storeFrom(store: string | undefined): SubscriptionStore {
    if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'APP_STORE';
    if (store === 'PLAY_STORE') return 'PLAY_STORE';
    if (store === 'PROMOTIONAL') return 'PROMOTIONAL';
    return 'MOCK';
  }

  private toState(payload: RevenueCatSubscriber): SubscriptionState {
    const entitlement = payload.subscriber?.entitlements?.[this.config.entitlementId];
    if (!entitlement) return INACTIVE;

    const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
    const productId = entitlement.product_identifier ?? null;
    const subscription = productId
      ? payload.subscriber?.subscriptions?.[productId]
      : undefined;

    const now = Date.now();
    const active = expiresAt === null || expiresAt.getTime() > now;
    const inGrace =
      !active &&
      entitlement.grace_period_expires_date !== null &&
      entitlement.grace_period_expires_date !== undefined &&
      new Date(entitlement.grace_period_expires_date).getTime() > now;

    return {
      status: active
        ? subscription?.period_type === 'trial'
          ? 'TRIALING'
          : 'ACTIVE'
        : inGrace
          ? 'IN_GRACE_PERIOD'
          : 'EXPIRED',
      store: this.storeFrom(subscription?.store?.toUpperCase()),
      productId,
      entitlement: this.config.entitlementId,
      originalTransactionId: payload.subscriber?.original_app_user_id ?? null,
      startedAt: entitlement.purchase_date ? new Date(entitlement.purchase_date) : null,
      expiresAt,
      trialEndsAt: subscription?.period_type === 'trial' ? expiresAt : null,
      willRenew: Boolean(active && !subscription?.unsubscribe_detected_at),
    };
  }
}
