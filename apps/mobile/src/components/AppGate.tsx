import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Button, LoadingState, Screen, Text } from '@masalim/ui';
import { useSession } from '../stores/session';
import { useAppConfig } from '../hooks/queries';
import { useI18n } from '../i18n';
import { decideGate } from '../lib/app-gate';

/**
 * Decides which world the app is in before any screen renders.
 *
 * The decision itself is `decideGate`, kept separate and tested; this component
 * is only the wiring — where each input comes from, and what each answer looks
 * like on screen.
 *
 * Redirects run in an effect rather than during render: navigating while the
 * router is still mounting is how "attempted to navigate before mounting"
 * happens.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const status = useSession((state) => state.status);
  const user = useSession((state) => state.user);
  const { data: config, isPending } = useAppConfig();
  const { t } = useI18n();

  const decision = decideGate({
    configPending: isPending,
    updateRequired: config?.update?.updateRequired ?? false,
    sessionStatus: status,
    inOnboarding: segments[0] === '(onboarding)' || segments[0] === '(auth)',
    onboardingCompleted: user?.onboardingCompleted ?? false,
  });

  const destination = decision.kind === 'redirect' ? decision.to : null;

  useEffect(() => {
    if (destination !== null) router.replace(destination);
  }, [destination, router]);

  if (decision.kind === 'update-required') {
    return <ForcedUpdate />;
  }

  // Also while a redirect is pending: the effect runs after this render, and
  // the screen it is leaving must not be allowed to paint in the meantime.
  if (decision.kind === 'wait' || decision.kind === 'redirect') {
    return (
      <Screen scroll={false}>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return <>{children}</>;
}

function ForcedUpdate() {
  const { t } = useI18n();

  return (
    <Screen scroll={false} contentStyle={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <Text variant="h2" align="center">
        {t('update.title')}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {t('update.body')}
      </Text>
      <Button
        label={t('update.action')}
        onPress={() => {
          void Linking.openURL(
            'https://masalim.app/indir',
          );
        }}
      />
    </Screen>
  );
}
