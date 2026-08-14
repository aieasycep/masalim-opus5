import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, palette, StepIndicator, Text, useTheme } from '@masalim/ui';
import { useI18n } from '../../src/i18n';

const SLIDES = ['slide1', 'slide2', 'slide3', 'slide4'] as const;

/**
 * The four value slides.
 *
 * Dark, because the app's identity is bedtime and the first impression should
 * say so. "Geç" is present on every slide: a parent who already knows what this
 * is should not have to swipe through four screens to sign in.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index] ?? SLIDES[0];
  const isLast = index === SLIDES.length - 1;

  const advance = (): void => {
    if (isLast) router.push('/(auth)/sign-up');
    else setIndex((current) => current + 1);
  };

  return (
    <LinearGradient
      colors={[...theme.gradients.night.colors]}
      locations={[...theme.gradients.night.locations]}
      start={theme.gradients.night.start}
      end={theme.gradients.night.end}
      style={styles.root}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Button
          label={t('common.skip')}
          variant="tertiary"
          size="small"
          fullWidth={false}
          onPress={() => {
            router.push('/(auth)/sign-up');
          }}
          style={styles.skip}
        />
      </View>

      <View style={styles.body}>
        <View style={[styles.art, { backgroundColor: `${palette.nightPurple}33` }]}>
          <Text variant="hero">{['✨', '🧒', '🎙️', '📖'][index] ?? '✨'}</Text>
        </View>

        <Text variant="display" align="center" style={{ color: palette.cream }}>
          {t(`onboarding.${slide}.headline`)}
        </Text>
        <Text
          variant="bodyLarge"
          align="center"
          style={[styles.slideBody, { color: palette.lavenderLight }]}
        >
          {t(`onboarding.${slide}.body`)}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <StepIndicator
          current={index + 1}
          total={SLIDES.length}
          showCount={false}
          style={styles.steps}
        />
        <Button
          label={isLast ? t('onboarding.slide4.cta') : t('common.continue')}
          onPress={advance}
        />
      </View>
    </LinearGradient>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 24, alignItems: 'flex-end' },
  skip: { borderColor: 'transparent' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  art: {
    width: Math.min(220, width * 0.55),
    height: Math.min(220, width * 0.55),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  slideBody: { marginTop: 4, maxWidth: 320 },
  footer: { paddingHorizontal: 24, gap: 20 },
  steps: { justifyContent: 'center' },
});
