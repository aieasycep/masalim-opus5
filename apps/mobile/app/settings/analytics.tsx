import { StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Card,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { usePrivacyPreferences, useUpdatePrivacyPreferences } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

/**
 * Analytics consent.
 *
 * Off until a parent turns it on, and the screen says what is never sent rather
 * than only what is. In an app holding a child's name, a story written about
 * them and a recording of their parent's voice, "anonymous usage data" is a
 * phrase that has to be shown its receipts — the list is the specific promise
 * the redaction layer in @masalim/analytics actually keeps.
 *
 * The state line reports what is true right now, not what the toggle looks
 * like: if the write failed, the toggle springs back and the line still reads
 * off, because the server is what decides.
 */
export default function AnalyticsSettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();

  const { data: preferences, isPending } = usePrivacyPreferences();
  const update = useUpdatePrivacyPreferences();

  const consented = preferences?.analyticsConsent ?? false;

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.analyticsTitle')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : (
        <>
          <Card style={styles.row}>
            <View style={styles.rowBody}>
              <Text variant="title">{t('settings.analyticsToggle')}</Text>
              <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                {consented ? t('settings.analyticsOn') : t('settings.analyticsOff')}
              </Text>
            </View>
            <Switch
              value={consented}
              disabled={update.isPending}
              accessibilityLabel={t('settings.analyticsToggle')}
              onValueChange={(next) => {
                update.mutate(
                  { analyticsConsent: next },
                  {
                    onError: (cause) => {
                      toast.show({ message: errorCopy(cause).message, tone: 'error' });
                    },
                  },
                );
              }}
            />
          </Card>

          <Text variant="small" tone="muted" style={styles.body}>
            {t('settings.analyticsBody')}
          </Text>

          {/* The specific promise, not a reassuring adjective. */}
          <Card style={styles.never}>
            <View style={styles.neverHeader}>
              <Icon name="lock" size={18} color={theme.colors.primary} />
              <Text variant="smallBold">{t('settings.analyticsNeverSent')}</Text>
            </View>
            <Text variant="small" tone="muted">
              {t('settings.analyticsNeverSentItems')}
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  rowBody: { flex: 1, gap: 4 },
  body: { marginTop: 16 },
  never: { gap: 8, marginTop: 20 },
  neverHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
