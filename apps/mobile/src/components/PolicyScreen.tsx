import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Button, Card, Icon, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import { useI18n } from '../i18n';

export interface PolicyScreenProps {
  titleKey: string;
  summaryKey: string;
  url: string;
}

/**
 * A legal document, summarised here and read in full elsewhere.
 *
 * The canonical text lives on the web because it has to be updatable without an
 * App Store release — a policy that can only change when a build ships is a
 * policy that goes stale. What sits in the app is a plain-language summary, so a
 * parent gets the substance without leaving, and the full document is one tap
 * away in an in-app browser rather than a context switch to Safari.
 */
export function PolicyScreen({ titleKey, summaryKey, url }: PolicyScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Screen>
      <ScreenHeader
        title={t(titleKey)}
        onBack={() => {
          router.back();
        }}
      />

      <Card style={styles.summary}>
        <Icon name="info" size={18} color={theme.colors.primary} />
        <Text variant="small" tone="muted" style={styles.summaryText}>
          {t(summaryKey)}
        </Text>
      </Card>

      <Button
        label={t(titleKey)}
        variant="secondary"
        style={styles.open}
        onPress={() => {
          void WebBrowser.openBrowserAsync(url);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  summaryText: { flex: 1 },
  open: { marginTop: 24 },
});
