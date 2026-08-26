/* eslint-disable no-console -- This provider *is* the console sink: printing is
   its entire purpose, and the rule exists to catch stray debugging elsewhere. */
import type { AnalyticsEvent, AnalyticsProperties } from '@masalim/types';
import type { AnalyticsProvider } from './types';

/**
 * Prints what would have been sent.
 *
 * Worth having because redaction is the safety-critical part of this package:
 * being able to see the exact payload during development is how anyone
 * confirms a child's name is really not in it, rather than trusting that the
 * key-matching rules covered the property they just added.
 */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'console';

  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    console.info(`[analytics] ${event}`, properties ?? {});
  }

  identify(distinctId: string): void {
    console.info(`[analytics] identify ${distinctId}`);
  }

  reset(): void {
    console.info('[analytics] reset');
  }

  async flush(): Promise<void> {}
}
