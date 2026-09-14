import type { AnalyticsEvent, AnalyticsProperties } from '@masalim/types';

/**
 * What an analytics backend has to be able to do.
 *
 * Four methods, chosen so that swapping PostHog for something else never
 * reaches a call site. Everything is fire-and-forget and returns void: a screen
 * must never await a metric, and a failing analytics vendor must never be able
 * to slow down or break a bedtime story.
 */
export interface AnalyticsProvider {
  readonly name: string;
  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void;
  /** Associates subsequent events with an account. Never called with an email. */
  identify(distinctId: string, properties?: AnalyticsProperties): void;
  /** Forgets the association — on sign-out, and on consent withdrawal. */
  reset(): void;
  flush(): Promise<void>;
}

export interface AnalyticsConfig {
  /**
   * Off unless a key is present, so a build without analytics configured is
   * silent rather than half-instrumented.
   */
  apiKey?: string | undefined;
  host?: string | undefined;
  /** Environment tag attached to every event, so staging never pollutes real data. */
  appEnv: string;
  /** Emits to the console instead of the network. */
  debug?: boolean | undefined;
}
