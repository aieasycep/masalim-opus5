import type {
  SubscriptionProvider,
  SubscriptionState,
  SubscriptionWebhookEvent,
} from '../../types';

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
 * Subscriptions without a store.
 *
 * Development needs to be able to turn Premium on and off, but only through the
 * same door the real thing uses: state lives here, and the API reads it through
 * `fetchState` exactly as it would read RevenueCat. Nothing in the mobile app can
 * grant itself an entitlement.
 */
export class MockSubscriptionProvider implements SubscriptionProvider {
  readonly name = 'mock';
  private readonly states = new Map<string, SubscriptionState>();
  private readonly seenEvents = new Set<string>();

  /**
   * The clock is injected rather than read from the environment, for the same
   * reason it is everywhere else in this codebase: a test that cannot control
   * "now" cannot test what happens when a subscription expires.
   */
  constructor(private readonly now: () => Date) {}

  async fetchState(userId: string): Promise<SubscriptionState> {
    return this.states.get(userId) ?? INACTIVE;
  }

  /** Development affordance, reachable only from the admin panel. */
  grant(userId: string, options: { months?: number; trial?: boolean } = {}): SubscriptionState {
    const months = options.months ?? 1;
    const startedAt = this.now();
    const expiresAt = new Date(startedAt.getTime() + months * 30 * 24 * 60 * 60 * 1000);

    const state: SubscriptionState = {
      status: options.trial ? 'TRIALING' : 'ACTIVE',
      store: 'MOCK',
      productId: 'masalim_premium_monthly',
      entitlement: 'premium',
      originalTransactionId: `mock_txn_${userId}`,
      startedAt,
      expiresAt,
      trialEndsAt: options.trial ? expiresAt : null,
      willRenew: true,
    };
    this.states.set(userId, state);
    return state;
  }

  revoke(userId: string): SubscriptionState {
    const state: SubscriptionState = { ...INACTIVE, status: 'CANCELLED' };
    this.states.set(userId, state);
    return state;
  }

  parseWebhook(
    rawBody: string,
    _headers: Record<string, string | undefined>,
  ): SubscriptionWebhookEvent | null {
    let parsed: {
      eventId?: unknown;
      type?: unknown;
      userId?: unknown;
      active?: unknown;
    };
    try {
      parsed = JSON.parse(rawBody) as typeof parsed;
    } catch {
      return null;
    }

    if (typeof parsed.userId !== 'string' || typeof parsed.eventId !== 'string') {
      return null;
    }
    if (this.seenEvents.has(parsed.eventId)) {
      return null;
    }
    this.seenEvents.add(parsed.eventId);

    const state = parsed.active === true ? this.grant(parsed.userId) : this.revoke(parsed.userId);

    return {
      eventId: parsed.eventId,
      type: typeof parsed.type === 'string' ? parsed.type : 'MOCK_UPDATE',
      userId: parsed.userId,
      state,
      redactedPayload: { provider: this.name, type: parsed.type },
    };
  }
}
