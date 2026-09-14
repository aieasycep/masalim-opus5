import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Card,
  ListItem,
  LoadingState,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  useToast,
} from '@masalim/ui';
import type { AudioPreferencesInput } from '@masalim/validation';
import { useAudioPreferences, useUpdateAudioPreferences } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

/** The three rates the player offers; anything finer is fiddly on a phone. */
const RATES = [0.8, 1, 1.2] as const;

/** Minutes. `null` is "no timer", which is a real choice rather than an absence. */
const SLEEP_TIMERS: ReadonlyArray<number | null> = [null, 10, 20, 30, 45, 60];

/**
 * Playback defaults.
 *
 * These are starting points, not locks — the player can still be changed
 * mid-story. What they are for is the common case: a parent who always listens
 * at 0.8× with a twenty-minute timer should not set that again every night.
 */
export default function AudioSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();

  const { data: preferences, isPending } = useAudioPreferences();
  const update = useUpdateAudioPreferences();

  const save = (next: AudioPreferencesInput): void => {
    update.mutate(next, {
      onError: (cause) => {
        toast.show({ message: errorCopy(cause).message, tone: 'error' });
      },
    });
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.audio')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending || !preferences ? (
        <LoadingState label={t('common.loading')} />
      ) : (
        <>
          <Text variant="smallBold" tone="muted" style={styles.label}>
            {t('settings.audioDefaultSpeed')}
          </Text>
          {/* The control speaks in strings; the schema speaks in a literal union. */}
          <SegmentedControl
            options={RATES.map((rate) => ({ value: String(rate), label: `${String(rate)}×` }))}
            value={String(preferences.defaultPlaybackRate)}
            accessibilityLabel={t('settings.audioDefaultSpeed')}
            onChange={(next) => {
              const rate = RATES.find((candidate) => String(candidate) === next);
              if (rate === undefined) return;
              save({ ...preferences, defaultPlaybackRate: rate });
            }}
          />

          <Text variant="smallBold" tone="muted" style={styles.label}>
            {t('settings.audioSleepTimer')}
          </Text>
          <Card padding={0} style={styles.section}>
            {SLEEP_TIMERS.map((minutes) => (
              <ListItem
                key={String(minutes)}
                title={
                  minutes === null ? t('player.sleepTimerOff') : t('player.sleepTimerMinutes', { count: minutes })
                }
                {...(preferences.defaultSleepTimerMinutes === minutes
                  ? { icon: 'check' as const }
                  : {})}
                onPress={() => {
                  save({ ...preferences, defaultSleepTimerMinutes: minutes });
                }}
              />
            ))}
          </Card>

          <Card padding={0} style={styles.section}>
            <ListItem
              title={t('settings.audioAutoPlay')}
              toggle={{
                value: preferences.autoPlayNext,
                disabled: update.isPending,
                onValueChange: (next) => {
                  save({ ...preferences, autoPlayNext: next });
                },
              }}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 24, marginBottom: 10 },
  section: { overflow: 'hidden' },
});
