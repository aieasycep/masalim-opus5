import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, LoadingState, Screen, ScreenHeader, Text, useToast } from '@masalim/ui';
import { personNameSchema } from '@masalim/validation';
import { useMe, useUpdateProfile } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

/**
 * The account.
 *
 * The email is shown but not editable: it identifies the account and is what
 * password recovery and the deletion confirmation are keyed on, so changing it
 * is a verification flow rather than a text field. Showing it read-only is
 * clearer than hiding it — a parent needs to know which address they signed up
 * with.
 */
export default function AccountSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();

  const { data: me, isPending } = useMe();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me) setName(me.name ?? '');
  }, [me]);

  if (isPending || !me) {
    return (
      <Screen>
        <ScreenHeader
          title={t('settings.account')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  const save = (): void => {
    // The same schema the API validates with, so nothing passes here and fails there.
    const parsed = personNameSchema.safeParse(name);

    if (!parsed.success) {
      setError(t(`validation.${parsed.error.issues[0]?.message ?? 'INVALID_INPUT'}`));
      return;
    }

    setError(null);
    updateProfile.mutate(
      { name: parsed.data },
      {
        onSuccess: () => {
          toast.show({ message: t('common.save'), tone: 'success' });
        },
        onError: (cause) => {
          setError(errorCopy(cause).message);
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.account')}
        onBack={() => {
          router.back();
        }}
      />

      <Card style={styles.form}>
        <Input
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={60}
          error={error}
        />

        <Text variant="caption" tone="muted">
          {t('auth.email')}
        </Text>
        <Text variant="body" selectable>
          {me.email}
        </Text>

        <Button
          label={t('common.save')}
          loading={updateProfile.isPending}
          disabled={name.trim() === (me.name ?? '')}
          style={styles.save}
          onPress={save}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, marginTop: 16 },
  save: { marginTop: 8 },
});
