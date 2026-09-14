import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { signUpSchema, type SignUpInput } from '@masalim/validation';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { Screen, ScreenHeader, Text } from '@masalim/ui';
import { analytics } from '../../src/lib/analytics';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { AuthForm, AuthLink } from '../../src/components/AuthForm';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { TermsCheckbox } from '../../src/components/TermsCheckbox';

export default function SignUpScreen() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const adopt = useSession((state) => state.adopt);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = useMutation({
    mutationFn: (values: SignUpInput) => api.auth.signUp(values),
    onSuccess: async (session) => {
      await adopt(session);
      analytics.capture(ANALYTICS_EVENTS.SIGN_UP_COMPLETED, { method: 'email' });
      // Every screen past here assumes a child exists, so that is the next step.
      router.replace('/(onboarding)/child');
    },
    onError: (cause: unknown) => {
      setError(errorCopy(cause).message);
    },
  });

  return (
    <Screen>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
        backLabel={t('common.back')}
      />

      <View style={styles.intro}>
        <Text variant="h1">{t('auth.welcomeTitle')}</Text>
        <Text variant="body" tone="muted" style={styles.introBody}>
          {t('auth.welcomeBody')}
        </Text>
      </View>

      <AuthForm<SignUpInput>
        schema={signUpSchema}
        defaultValues={
          { email: '', password: '', name: '', acceptedTerms: true } as SignUpInput
        }
        fields={[
          {
            name: 'name',
            label: t('auth.name'),
            placeholder: t('auth.namePlaceholder'),
            autoComplete: 'name',
          },
          {
            name: 'email',
            label: t('auth.email'),
            placeholder: t('auth.emailPlaceholder'),
            autoComplete: 'email',
            keyboardType: 'email-address',
          },
          {
            name: 'password',
            label: t('auth.password'),
            placeholder: t('auth.passwordPlaceholder'),
            secure: true,
            autoComplete: 'new-password',
          },
        ]}
        submitLabel={t('auth.signUp')}
        submitting={signUp.isPending}
        errorMessage={error}
        onSubmit={(values) => {
          if (!accepted) {
            setError(t('validation.TERMS_NOT_ACCEPTED'));
            return;
          }
          setError(null);
          signUp.mutate({ ...values, acceptedTerms: true });
        }}
        footer={<SocialAuthButtons disabled={!accepted} />}
      />

      <TermsCheckbox
        checked={accepted}
        onChange={(next) => {
          setAccepted(next);
          if (next) setError(null);
        }}
        style={styles.terms}
      />

      <View style={styles.switch}>
        <Text variant="small" tone="muted">
          {t('auth.haveAccount')}
        </Text>
        <AuthLink
          label={t('auth.signIn')}
          onPress={() => {
            router.push('/(auth)/sign-in');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 24 },
  introBody: { marginTop: 8 },
  terms: { marginTop: 20 },
  switch: { marginTop: 24, alignItems: 'center', gap: 2 },
});
