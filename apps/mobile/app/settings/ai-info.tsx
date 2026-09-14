import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Icon, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import type { IconName } from '@masalim/ui';
import { useI18n } from '../../src/i18n';

const POINTS: ReadonlyArray<{ key: string; icon: IconName; labelKey: string }> = [
  { key: 'safety', icon: 'lock', labelKey: 'settings.childSafety' },
  { key: 'voice', icon: 'microphone', labelKey: 'settings.voiceDataBody' },
  { key: 'data', icon: 'info', labelKey: 'settings.voiceData' },
];

/**
 * What the AI does, in a parent's terms.
 *
 * Required disclosure, but it is also the screen that answers the question a
 * parent actually has at 8pm: is anyone checking what this thing tells my child?
 * So the safety check leads, and the voice boundary — a cloned voice narrates
 * only that family's own stories — is stated rather than left to be inferred
 * from a privacy policy.
 */
export default function AiInfoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.aiInfoTitle')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="body" style={styles.body}>
        {t('settings.aiInfoBody')}
      </Text>

      <View style={styles.points}>
        {POINTS.map((point) => (
          <Card key={point.key} style={styles.point}>
            <Icon name={point.icon} size={18} color={theme.colors.primary} />
            <Text variant="small" tone="muted" style={styles.pointText}>
              {t(point.labelKey)}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 16 },
  points: { gap: 12, marginTop: 24 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pointText: { flex: 1 },
});
