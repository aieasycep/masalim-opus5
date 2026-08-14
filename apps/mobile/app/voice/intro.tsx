import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Icon, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import { useEntitlements } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

/**
 * The first screen of enrolment, and the one that decides whether the paywall is
 * honest.
 *
 * A free account is told here — before a single second is recorded — that parent
 * voices are a Premium feature, and told in the same breath that they may record
 * now and hear the result. What must never happen is the opposite order: sixty
 * seconds of reading aloud, then a wall (§36). The upgrade prompt comes later,
 * at the moment the voice is asked to narrate something, and the server enforces
 * exactly the same boundary.
 */
export default function VoiceIntroScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();

  const { data: entitlements } = useEntitlements();
  const isPremium = entitlements?.entitlements.parent_voice_clone ?? false;

  const points: Array<{ icon: 'clock' | 'volume' | 'microphone'; label: string }> = [
    { icon: 'clock', label: t('voice.introDuration') },
    { icon: 'volume', label: t('voice.introQuiet') },
  ];

  return (
    <Screen footerHeight={120}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
      />

      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.secondary }]}>
          <Icon name="microphone" size={36} color={theme.colors.primary} />
        </View>

        <Text variant="h3" align="center" style={styles.title}>
          {t('voice.introTitle')}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t('voice.introBody')}
        </Text>
      </View>

      <View style={styles.points}>
        {points.map((point) => (
          <View key={point.icon} style={styles.point}>
            <Icon name={point.icon} size={18} color={theme.colors.mutedForeground} />
            <Text variant="small" tone="muted" style={styles.pointLabel}>
              {point.label}
            </Text>
          </View>
        ))}
      </View>

      {/*
        Stated up front, not on the way out. A free parent still continues from
        here — recording and hearing a sample costs them nothing.
      */}
      {!isPremium ? (
        <Card style={styles.premiumNote}>
          <Icon name="star" size={18} color={theme.colors.primary} />
          <Text variant="small" tone="muted" style={styles.premiumText}>
            {t('voice.introPremiumNote')}
          </Text>
        </Card>
      ) : null}

      <Button
        label={t('voice.introStart')}
        style={styles.cta}
        onPress={() => {
          router.push('/voice/owner');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 32, gap: 8 },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { marginBottom: 4 },
  points: { marginTop: 32, gap: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointLabel: { flex: 1 },
  premiumNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 28 },
  premiumText: { flex: 1 },
  cta: { marginTop: 32 },
});
