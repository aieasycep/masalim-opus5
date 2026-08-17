import { useEffect } from 'react';
import { usePrivacyPreferences } from '../hooks/queries';
import { useSession } from '../stores/session';
import { analytics, resolveProvider } from '../lib/analytics';

/**
 * Connects the stored decision to the analytics runtime.
 *
 * Renders nothing. It exists because consent is a server fact that arrives
 * after the app has already started drawing, and until it arrives the client
 * must stay silent — which it does by default, since `Analytics` begins
 * un-consented and drops rather than queues.
 *
 * Sign-out resets the provider as well as clearing the association, so the link
 * between this device and an account does not outlive the session. Signing in
 * as someone else therefore cannot inherit the previous account's identity.
 */
export function AnalyticsGate(): null {
  const userId = useSession((state) => state.user?.id ?? null);
  const { data: preferences } = usePrivacyPreferences();

  useEffect(() => {
    analytics.setProvider(resolveProvider());
  }, []);

  useEffect(() => {
    if (!preferences) return;
    analytics.setConsent(preferences.analyticsConsent);
  }, [preferences]);

  useEffect(() => {
    if (!preferences?.analyticsConsent) return;
    if (userId) {
      // The account id, never the email — a distinct id is not a property and
      // so never passes through the redaction layer.
      analytics.identify(userId);
    } else {
      analytics.reset();
    }
  }, [preferences?.analyticsConsent, userId]);

  return null;
}
