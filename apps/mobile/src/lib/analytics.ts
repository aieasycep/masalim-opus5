import Constants from 'expo-constants';
import {
  Analytics,
  ConsoleAnalyticsProvider,
  HttpAnalyticsProvider,
  NoopAnalyticsProvider,
  type AnalyticsProvider,
} from '@masalim/analytics';

interface AnalyticsExtra {
  appEnv?: string;
  posthogKey?: string;
  posthogHost?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as AnalyticsExtra;

/**
 * The app's single analytics client.
 *
 * A module-level instance rather than a context: capture is fire-and-forget and
 * has no rendering consequence, so putting it behind a hook would only add a
 * subscription that nothing needs and make it awkward to report from a mutation
 * callback, which is where most of the interesting events actually happen.
 *
 * Consent starts false and the client drops events until it is granted — that
 * is the package's own rule, and it means an un-consented session reports
 * nothing rather than buffering it for later.
 */
export const analytics = new Analytics({
  appEnv: extra.appEnv ?? 'development',
  ...(extra.posthogKey ? { apiKey: extra.posthogKey } : {}),
  ...(extra.posthogHost ? { host: extra.posthogHost } : {}),
});

/**
 * Chooses where events go.
 *
 * No key means the no-op provider: a build nobody configured analytics for
 * should be silent, not half-instrumented against a dashboard that does not
 * exist. In development the console provider prints the exact redacted payload,
 * which is how anyone verifies a child's name really is not in it.
 */
export function resolveProvider(): AnalyticsProvider {
  if (extra.posthogKey && extra.posthogHost) {
    return new HttpAnalyticsProvider(extra.posthogKey, extra.posthogHost);
  }
  return __DEV__ ? new ConsoleAnalyticsProvider() : new NoopAnalyticsProvider();
}
