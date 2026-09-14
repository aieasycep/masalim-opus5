import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from '@masalim/ui';
import { api } from '../lib/api';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { analytics } from '../lib/analytics';
import { useSession } from '../stores/session';
import { useI18n } from '../i18n';

export interface SocialAuthButtonsProps {
  disabled?: boolean | undefined;
}

/**
 * Apple and Google sign-in.
 *
 * The native modules are loaded lazily so a build without them configured still
 * runs — a developer working on the story flow should not be blocked by an
 * Apple Developer account they do not have yet. When a provider is unavailable
 * the button says so instead of failing silently on tap.
 *
 * Sign in with Apple is required by App Store review whenever another social
 * provider is offered, which is why it is first on iOS.
 */
export function SocialAuthButtons({ disabled = false }: SocialAuthButtonsProps) {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const adopt = useSession((state) => state.adopt);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (
    session: Awaited<ReturnType<typeof api.auth.signIn>>,
    method: 'apple' | 'google',
  ): Promise<void> => {
    await adopt(session);

    // Reported with the same events as the email path and a different `method`.
    // Leaving these silent while email carries method:'email' would make the
    // provider split look like a preference for email rather than a gap.
    // Onboarding not yet completed is how a first sign-in is distinguished from
    // a returning one; the server decides which this was.
    analytics.capture(
      session.user.onboardingCompleted
        ? ANALYTICS_EVENTS.SIGN_IN_COMPLETED
        : ANALYTICS_EVENTS.SIGN_UP_COMPLETED,
      { method, onboarding_completed: session.user.onboardingCompleted },
    );

    router.replace(
      session.user.onboardingCompleted ? '/(tabs)' : '/(onboarding)/child',
    );
  };

  const withApple = async (): Promise<void> => {
    setBusy('apple');
    setError(null);
    try {
      const AppleAuthentication = await import('expo-apple-authentication');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple returned no identity token');
      }

      // Apple gives the name exactly once, on first authorisation; if it is not
      // passed through now it is gone for good.
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ');

      await finish(
        await api.auth.signInWithApple(
          credential.identityToken,
          fullName.length > 0 ? fullName : undefined,
        ),
        'apple',
      );
    } catch (cause) {
      // A cancelled sheet is not a failure worth showing.
      if (isCancellation(cause)) return;
      setError(errorCopy(cause).message);
    } finally {
      setBusy(null);
    }
  };

  const withGoogle = async (): Promise<void> => {
    setBusy('google');
    setError(null);
    try {
      const GoogleSignIn = await import('@react-native-google-signin/google-signin');
      await GoogleSignIn.GoogleSignin.hasPlayServices();
      const response = await GoogleSignIn.GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (!idToken) {
        throw new Error('Google returned no id token');
      }

      await finish(await api.auth.signInWithGoogle(idToken), 'google');
    } catch (cause) {
      if (isCancellation(cause)) return;
      setError(errorCopy(cause).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <Button
          label={t('auth.continueWithApple')}
          variant="secondary"
          disabled={disabled || busy !== null}
          loading={busy === 'apple'}
          onPress={() => {
            void withApple();
          }}
        />
      ) : null}

      <Button
        label={t('auth.continueWithGoogle')}
        variant="tertiary"
        disabled={disabled || busy !== null}
        loading={busy === 'google'}
        onPress={() => {
          void withGoogle();
        }}
      />

      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function isCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return (
    code === 'ERR_REQUEST_CANCELED' ||
    code === 'ERR_CANCELED' ||
    code === 'SIGN_IN_CANCELLED' ||
    code === '-5'
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
});
