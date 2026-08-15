import type { AnalyticsEvent, AnalyticsProperties } from '@masalim/types';
import { redact } from './redaction';
import type { AnalyticsConfig, AnalyticsProvider } from './types';

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
  private consented = false;
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
    return this.consented;
  }

  /**
   * Turns collection on or off.
   *
   * Withdrawing resets the provider as well as stopping capture, so the
   * association between this device and an account does not survive the
   * decision.
   */
  setConsent(consented: boolean): void {
    if (this.consented && !consented) {
      this.safely(() => {
        this.provider.reset();
      });
    }
    this.consented = consented;
  }

  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    if (!this.consented) return;
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
    if (!this.consented) return;
    this.safely(() => {
      this.provider.identify(userId, redact(properties));
    });
  }

  reset(): void {
    this.safely(() => {
      this.provider.reset();
    });
  }

  async flush(): Promise<void> {
    if (!this.consented) return;
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
