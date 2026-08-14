import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Card,
  Icon,
  Input,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { useMe, useRequestDeletion } from '../../src/hooks/queries';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { formatShortDate } from '../../src/lib/format';

/**
 * Deleting the account.
 *
 * Deliberately awkward. The parent retypes their own email before the button
 * works, because an accidental tap here destroys a family's stories, their
 * children's profiles and a cloned voice that took sixty seconds of reading to
 * make. The server enforces the same check, so this is not merely a UI speed
 * bump.
 *
 * What it produces is a *request*, and the copy says so with the date it will be
 * carried out. A worker then does the real work — including deleting the voice
 * at the provider — which is why claiming "your data is gone" the instant the
 * button is pressed would be a lie (§84).
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, errorCopy } = useI18n();

  const { data: me, isPending } = useMe();
  const requestDeletion = useRequestDeletion();
  const signOut = useSession((state) => state.signOut);

  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  if (isPending || !me) {
    return (
      <Screen>
        <ScreenHeader
          title={t('settings.deleteAccount')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  const matches = confirmEmail.trim().toLowerCase() === me.email.toLowerCase();

  // Once scheduled there is nothing left to type; show when it happens.
  if (scheduledFor) {
    return (
      <Screen>
        <View style={styles.done}>
          <View style={[styles.mark, { backgroundColor: theme.colors.muted }]}>
            <Icon name="clock" size={32} color={theme.colors.mutedForeground} />
          </View>

          <Text variant="body" tone="muted" align="center">
            {t('settings.deleteAccountScheduled', {
              date: formatShortDate(scheduledFor, locale),
            })}
          </Text>

          <Button
            label={t('settings.logout')}
            style={styles.doneCta}
            onPress={() => {
              void signOut();
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.deleteAccount')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h5" style={styles.title}>
        {t('settings.deleteAccountTitle')}
      </Text>

      <Card style={styles.warning}>
        <Icon name="warning" size={18} color={theme.colors.destructive} />
        <Text variant="small" tone="muted" style={styles.warningText}>
          {t('settings.deleteAccountBody')}
        </Text>
      </Card>

      <Input
        label={t('settings.deleteAccountConfirmLabel')}
        value={confirmEmail}
        onChangeText={(value) => {
          setConfirmEmail(value);
          setError(null);
        }}
        placeholder={me.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={styles.input}
        error={error}
      />

      <Button
        label={t('settings.deleteAccountConfirm')}
        variant="destructive"
        disabled={!matches}
        loading={requestDeletion.isPending}
        style={styles.cta}
        onPress={() => {
          requestDeletion.mutate(
            { confirmEmail: confirmEmail.trim().toLowerCase() },
            {
              onSuccess: (request) => {
                setScheduledFor(request.scheduledFor);
              },
              onError: (cause) => {
                setError(errorCopy(cause).message);
              },
            },
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 12 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  warningText: { flex: 1 },
  input: { marginTop: 24 },
  cta: { marginTop: 20 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  mark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  doneCta: { marginTop: 16, alignSelf: 'stretch' },
});
