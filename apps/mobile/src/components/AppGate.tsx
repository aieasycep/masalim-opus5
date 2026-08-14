import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Button, LoadingState, Screen, Text } from '@masalim/ui';
import { useSession } from '../stores/session';
import { useAppConfig } from '../hooks/queries';
import { useI18n } from '../i18n';

/**
 * Decides which world the app is in before any screen renders.
 *
 * Three gates, in order of severity:
 *
 *  1. A build below the supported floor cannot continue at all — it is talking
 *     to an API it no longer understands, and letting it through produces
 *     failures nobody can diagnose (§88).
 *  2. A signed-out parent belongs in onboarding, and a signed-in one must not be
 *     able to navigate back into it.
 *  3. A signed-in parent with no children yet goes to the child profile step,
 *     because every other screen in the app assumes one exists.
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

  const inOnboarding = segments[0] === '(onboarding)' || segments[0] === '(auth)';
  const updateRequired = config?.update?.updateRequired ?? false;

  useEffect(() => {
    if (updateRequired || isPending) return;

    if (status === 'anonymous' && !inOnboarding) {
      router.replace('/(onboarding)/welcome');
      return;
    }

    if (status === 'authenticated' && inOnboarding && user?.onboardingCompleted) {
      router.replace('/(tabs)');
    }
  }, [inOnboarding, isPending, router, status, updateRequired, user?.onboardingCompleted]);

  if (updateRequired) {
    return <ForcedUpdate />;
  }

  // The launch config has not answered yet. Rendering the app first and then
  // yanking it away if an update is required would be worse than a moment of
  // quiet.
  if (isPending && status === 'loading') {
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
