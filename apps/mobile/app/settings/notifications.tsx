import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, ListItem, LoadingState, Screen, ScreenHeader, useToast } from '@masalim/ui';
import type { NotificationPreferencesInput } from '@masalim/validation';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

const TOGGLES: ReadonlyArray<{ key: keyof NotificationPreferencesInput; labelKey: string }> = [
  { key: 'storyReady', labelKey: 'settings.notifyStoryReady' },
  { key: 'voiceReady', labelKey: 'settings.notifyVoiceReady' },
  { key: 'illustrationsReady', labelKey: 'settings.notifyIllustrations' },
  { key: 'orderUpdates', labelKey: 'settings.notifyOrders' },
  { key: 'productNews', labelKey: 'settings.notifyNews' },
];

/**
 * Which notifications are wanted.
 *
 * Each toggle writes immediately rather than waiting for a save button. The
 * preference is one boolean and the write is idempotent, so a "Kaydet" step
 * would only create a way to lose the change by navigating away.
 *
 * The whole set is sent on every change because the endpoint takes the complete
 * object; sending a partial would clear the others.
 */
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();

  const { data: preferences, isPending } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.notifications')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending || !preferences ? (
        <LoadingState label={t('common.loading')} />
      ) : (
        <Card padding={0} style={styles.section}>
          {TOGGLES.map((toggle) => (
            <ListItem
              key={toggle.key}
              title={t(toggle.labelKey)}
              toggle={{
                value: preferences[toggle.key],
                disabled: update.isPending,
                onValueChange: (next) => {
                  update.mutate(
                    { ...preferences, [toggle.key]: next },
                    {
                      onError: (cause) => {
                        toast.show({ message: errorCopy(cause).message, tone: 'error' });
                      },
                    },
                  );
                },
              }}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, overflow: 'hidden' },
});
