import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { signInSchema, type SignInInput } from '@masalim/validation';
import { Screen, ScreenHeader, Text } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { AuthForm, AuthLink } from '../../src/components/AuthForm';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';

export default function SignInScreen() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const adopt = useSession((state) => state.adopt);
  const [error, setError] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: (values: SignInInput) => api.auth.signIn(values),
    onSuccess: async (session) => {
      await adopt(session);
      router.replace(session.user.onboardingCompleted ? '/(tabs)' : '/(onboarding)/child');
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
        <Text variant="h1">{t('auth.signIn')}</Text>
      </View>

      <AuthForm<SignInInput>
        schema={signInSchema}
        defaultValues={{ email: '', password: '' } as SignInInput}
        fields={[
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
            secure: true,
            autoComplete: 'password',
          },
        ]}
        submitLabel={t('auth.signIn')}
        submitting={signIn.isPending}
        errorMessage={error}
        onSubmit={(values) => {
          setError(null);
          signIn.mutate(values);
        }}
        footer={<SocialAuthButtons />}
      />

      <AuthLink
        label={t('auth.forgotPassword')}
        onPress={() => {
          router.push('/(auth)/forgot-password');
        }}
      />

      <View style={styles.switch}>
        <Text variant="small" tone="muted">
          {t('auth.noAccount')}
        </Text>
        <AuthLink
          label={t('auth.signUp')}
          onPress={() => {
            router.replace('/(auth)/sign-up');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 24 },
  switch: { marginTop: 16, alignItems: 'center', gap: 2 },
});
