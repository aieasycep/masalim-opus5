import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@masalim/validation';
import { Screen, ScreenHeader, Text } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useI18n } from '../../src/i18n';
import { AuthForm } from '../../src/components/AuthForm';

/**
 * Password reset request.
 *
 * Always reports success, whether or not the address is registered. Telling a
 * stranger "no account with that email" turns the form into a way to discover
 * who has an account here — and the accounts belong to families with children.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [sent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: (values: RequestPasswordResetInput) => api.auth.requestPasswordReset(values.email),
    onSettled: () => {
      setSent(true);
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
        <Text variant="h1">{t('auth.resetPassword')}</Text>
      </View>

      {sent ? (
        <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
          {t('auth.resetPasswordSent')}
        </Text>
      ) : (
        <AuthForm<RequestPasswordResetInput>
          schema={requestPasswordResetSchema}
          defaultValues={{ email: '' } as RequestPasswordResetInput}
          fields={[
            {
              name: 'email',
              label: t('auth.email'),
              placeholder: t('auth.emailPlaceholder'),
              autoComplete: 'email',
              keyboardType: 'email-address',
            },
          ]}
          submitLabel={t('auth.resetPassword')}
          submitting={request.isPending}
          onSubmit={(values) => {
            request.mutate(values);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 24 },
});
