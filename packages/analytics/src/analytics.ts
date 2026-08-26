import type { AnalyticsEvent, AnalyticsProperties } from '@masalim/types';
import { redact } from './redaction';
import type { AnalyticsConfig, AnalyticsProvider } from './types';

/**
 * How many events are held while consent is still being read.
 *
 * Small on purpose. This buffer exists to survive one server round-trip at
 * start-up, not to accumulate a session.
 */
const PENDING_LIMIT = 32;

/** Does nothing, on purpose. The default everywhere a key is absent. */
export class NoopAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'noop';
  capture(): void {}
  identify(): void {}
  reset(): void {}
  async flush(): Promise<void> {}
}

/**
 * The client every call site talks to.
 *
 * Three things happen here that a provider should not be trusted to do:
 *
 * Consent is enforced before the provider is reached. Until it is granted
 * nothing is captured at all — not queued for later, dropped. A queue would
 * mean that granting consent retroactively sends everything a parent did while
 * they had not agreed, which is not what agreeing means.
 *
 * Payloads are redacted centrally, so no call site can leak a child's name by
 * being careless with a property key.
 *
 * Nothing throws. An analytics failure is invisible to the person using the
 * app, because the alternative is a metrics vendor taking down a bedtime story.
 */
export class Analytics {
  private provider: AnalyticsProvider = new NoopAnalyticsProvider();
  /**
   * Three states, not two.
   *
   * `unknown` is the distinction that matters. A parent who has already decided
   * and whose decision we have not finished reading is not the same as a parent
   * who has declined, and treating them alike silently loses every event
   * captured during start-up — including the sign-in that started the session.
   */
  private consent: 'unknown' | 'granted' | 'denied' = 'unknown';
  private pending: Array<{ event: AnalyticsEvent; properties?: AnalyticsProperties }> = [];
  private pendingIdentity: { userId: string; properties?: AnalyticsProperties } | null = null;
  private readonly baseProperties: AnalyticsProperties;

  constructor(config: AnalyticsConfig) {
    this.baseProperties = { app_env: config.appEnv };
  }

  /** Swapped once at start-up, and again if consent is withdrawn. */
  setProvider(provider: AnalyticsProvider): void {
    this.provider = provider;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get hasConsent(): boolean {
    return this.consent === 'granted';
  }

  /**
   * The stored decision, as read back from the server.
   *
   * Only this releases the start-up buffer, and only on the first resolution.
   * The distinction from `setConsent` is the whole point: a decision read from
   * storage already existed while those events were being captured, so sending
   * them is reporting activity the parent had already agreed to. A decision the
   * parent makes *now* says nothing about the minutes before it, which is why
   * the user-facing path deliberately cannot release anything.
   */
  resolveStoredConsent(consented: boolean): void {
    const firstResolution = this.consent === 'unknown';
    this.applyConsent(consented);

    const buffered = this.pending;
    const identity = this.pendingIdentity;
    this.pending = [];
    this.pendingIdentity = null;

    if (!consented || !firstResolution) return;

    if (identity) this.identify(identity.userId, identity.properties);
    for (const entry of buffered) this.capture(entry.event, entry.properties);
  }

  /**
   * The parent's answer, given just now in settings.
   *
   * Never replays: agreeing at this moment is not agreeing to what happened
   * before it. Anything buffered is discarded unsent.
   *
   * Withdrawing resets the provider as well as stopping capture, so the
   * association between this device and an account does not survive the
   * decision.
   */
  setConsent(consented: boolean): void {
    this.applyConsent(consented);
    this.pending = [];
    this.pendingIdentity = null;
  }

  private applyConsent(consented: boolean): void {
    if (this.consent === 'granted' && !consented) {
      this.safely(() => {
        this.provider.reset();
      });
    }
    this.consent = consented ? 'granted' : 'denied';
  }

  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    if (this.consent === 'denied') return;

    if (this.consent === 'unknown') {
      // Dropping the oldest rather than the newest: if start-up ever stalls long
      // enough to overflow this, the recent events are the ones still worth
      // having, and nothing here is important enough to grow without bound.
      this.pending.push({ event, ...(properties ? { properties } : {}) });
      if (this.pending.length > PENDING_LIMIT) this.pending.shift();
      return;
    }

    this.safely(() => {
      this.provider.capture(event, { ...this.baseProperties, ...redact(properties) });
    });
  }

  /**
   * Ties events to an account by its opaque id.
   *
   * The id and nothing else — an email here would put a real address in a
   * third-party system, which is the thing the redaction pass exists to stop.
   */
  identify(userId: string, properties?: AnalyticsProperties): void {
    if (this.consent === 'denied') return;

    if (this.consent === 'unknown') {
      // Only the latest matters; an identity is a replacement, not an event.
      this.pendingIdentity = { userId, ...(properties ? { properties } : {}) };
      return;
    }

    this.safely(() => {
      this.provider.identify(userId, redact(properties));
    });
  }

  reset(): void {
    // Anything still waiting on a consent answer belonged to the session being
    // discarded, so it must not be released under the next one.
    this.pending = [];
    this.pendingIdentity = null;
    this.safely(() => {
      this.provider.reset();
    });
  }

  async flush(): Promise<void> {
    if (this.consent !== 'granted') return;
    await this.provider.flush().catch(() => undefined);
  }

  private safely(run: () => void): void {
    try {
      run();
    } catch {
      // Deliberately silent: a metric is never worth a visible failure.
    }
  }
}
