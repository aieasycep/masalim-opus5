import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Card,
  ConfirmDialog,
  ListItem,
  Screen,
  ScreenHeader,
  Text,
  useToast,
} from '@masalim/ui';
import type { IconName } from '@masalim/ui';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { env } from '../../src/config/env';

interface Row {
  key: string;
  labelKey: string;
  icon: IconName;
  route: string;
}

const ACCOUNT_ROWS: readonly Row[] = [
  { key: 'account', labelKey: 'settings.account', icon: 'profile', route: '/settings/account' },
  {
    key: 'notifications',
    labelKey: 'settings.notifications',
    icon: 'bell',
    route: '/settings/notifications',
  },
  { key: 'language', labelKey: 'settings.language', icon: 'info', route: '/settings/language' },
  { key: 'audio', labelKey: 'settings.audio', icon: 'volume', route: '/settings/audio' },
];

const PRIVACY_ROWS: readonly Row[] = [
  {
    key: 'voiceData',
    labelKey: 'settings.voiceData',
    icon: 'microphone',
    route: '/settings/voice-data',
  },
  { key: 'aiInfo', labelKey: 'settings.aiInfo', icon: 'sparkle', route: '/settings/ai-info' },
  {
    key: 'analytics',
    labelKey: 'settings.analyticsTitle',
    icon: 'info',
    route: '/settings/analytics',
  },
  {
    key: 'privacy',
    labelKey: 'settings.privacyPolicy',
    icon: 'lock',
    route: '/settings/privacy',
  },
  { key: 'terms', labelKey: 'settings.terms', icon: 'book', route: '/settings/terms' },
];

/**
 * The settings menu.
 *
 * Grouped so the data-rights screens — voice data, what the AI does, the policy
 * — sit together and are reachable in one tap rather than buried under an
 * "Advanced" heading. A parent who wants to know what happens to their voice
 * recording should not have to hunt for it.
 *
 * Signing out and deleting the account are separated at the bottom, and only the
 * destructive one is coloured as such.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const signOut = useSession((state) => state.signOut);

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const section = (rows: readonly Row[]) => (
    <Card padding={0} style={styles.section}>
      {rows.map((row) => (
        <ListItem
          key={row.key}
          title={t(row.labelKey)}
          icon={row.icon}
          showChevron
          onPress={() => {
            router.push(row.route as never);
          }}
        />
      ))}
    </Card>
  );

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.title')}
        onBack={() => {
          router.back();
        }}
      />

      {section(ACCOUNT_ROWS)}
      {section(PRIVACY_ROWS)}

      <Card padding={0} style={styles.section}>
        <ListItem
          title={t('settings.logout')}
          icon="logOut"
          onPress={() => {
            setConfirmingSignOut(true);
          }}
        />
        <ListItem
          title={t('settings.deleteAccount')}
          icon="trash"
          tone="destructive"
          onPress={() => {
            router.push('/settings/delete-account');
          }}
        />
      </Card>

      <View style={styles.version}>
        <Text variant="caption" tone="muted" align="center">
          {t('settings.version', { version: env.appVersion })}
        </Text>
      </View>

      <ConfirmDialog
        visible={confirmingSignOut}
        title={t('settings.logout')}
        confirmLabel={t('settings.logout')}
        cancelLabel={t('common.cancel')}
        loading={signingOut}
        onConfirm={() => {
          setSigningOut(true);
          void signOut()
            .catch((cause: unknown) => {
              toast.show({ message: errorCopy(cause).message, tone: 'error' });
            })
            .finally(() => {
              setSigningOut(false);
              setConfirmingSignOut(false);
            });
        }}
        onCancel={() => {
          setConfirmingSignOut(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, overflow: 'hidden' },
  version: { marginTop: 32 },
});
