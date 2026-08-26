import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Button, Card, Icon, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import { MIC_TEST } from '@masalim/types';
import { useI18n } from '../../src/i18n';
import { meterLevel, micTestVerdict, type MicTestVerdict } from '../../src/lib/recording';
import { MIC_TEST_RECORDING_OPTIONS } from '../../src/lib/recording-options';

/**
 * The microphone check.
 *
 * A throwaway recording is started purely to read its metering, and the samples
 * are never uploaded — this is a rehearsal, not a take. The verdict comes from
 * the same two thresholds the server's quality control uses, so a parent who is
 * told the room sounds fine here is not rejected sixty seconds later for noise.
 *
 * `metering` is dBFS: 0 is full scale and everything below is negative, so
 * "louder" means closer to zero.
 */
export default function MicTestScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();

  const recorder = useAudioRecorder(MIC_TEST_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [peak, setPeak] = useState<number | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const level = useRef(new Animated.Value(0)).current;

  const stop = useCallback(() => {
    if (recorder.isRecording) {
      void recorder.stop();
    }
  }, [recorder]);

  // Ask, then start listening. Denial is a state with a way out, not a dead end.
  useEffect(() => {
    let cancelled = false;

    const begin = async (): Promise<void> => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (cancelled) return;

      if (!granted) {
        setPermission('denied');
        return;
      }

      setPermission('granted');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (cancelled) return;
      recorder.record();
    };

    void begin();

    return () => {
      cancelled = true;
      stop();
    };
  }, [recorder, stop]);

  // Track the loudest and quietest moments of the sample.
  useEffect(() => {
    const metering = state.metering;
    if (!state.isRecording || metering === undefined) return;

    setPeak((current) => (current === null ? metering : Math.max(current, metering)));
    setFloor((current) => (current === null ? metering : Math.min(current, metering)));

    Animated.timing(level, {
      toValue: meterLevel(metering),
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [level, state.isRecording, state.metering]);

  const sampled = (state.durationMillis ?? 0) >= MIC_TEST.SAMPLE_SECONDS * 1000;

  const verdict: MicTestVerdict | null =
    sampled && peak !== null && floor !== null
      ? micTestVerdict({ peakDbfs: peak, floorDbfs: floor })
      : null;

  const VERDICT_COPY: Record<MicTestVerdict, string> = {
    quiet: t('voice.micTestQuiet'),
    noisy: t('voice.micTestNoisy'),
    tooQuiet: t('voice.micTestTooQuiet'),
  };

  if (permission === 'denied') {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <View style={styles.denied}>
          <Icon name="microphone" size={40} color={theme.colors.mutedForeground} />
          <Text variant="h5" align="center" style={styles.deniedTitle}>
            {t('voice.micTestPermissionTitle')}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {t('voice.micTestPermissionBody')}
          </Text>
          <Button
            label={t('voice.micTestOpenSettings')}
            variant="secondary"
            style={styles.deniedCta}
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen footerHeight={110}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h4" align="center" style={styles.title}>
        {t('voice.micTestTitle')}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {t('voice.micTestSpeak')}
      </Text>

      {/* A live level, driven by real metering rather than an idle animation. */}
      <View style={styles.meterWrap} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.meterTrack, { backgroundColor: theme.colors.muted }]}>
          <Animated.View
            style={[
              styles.meterFill,
              {
                backgroundColor: theme.colors.primary,
                width: level.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </View>

      {verdict ? (
        <Card style={styles.verdict}>
          <Icon
            name={verdict === 'quiet' ? 'check' : 'info'}
            size={18}
            color={verdict === 'quiet' ? theme.colors.success : theme.colors.warning}
          />
          <Text
            variant="small"
            tone="muted"
            style={styles.verdictText}
            accessibilityLiveRegion="polite"
          >
            {VERDICT_COPY[verdict]}
          </Text>
        </Card>
      ) : null}

      {/*
        Continuing is never blocked on the verdict. A noisy kitchen at 8pm is the
        normal case, and the recording itself is checked properly afterwards —
        this screen advises, it does not gate.
      */}
      <Button
        label={t('common.continue')}
        disabled={!sampled}
        style={styles.cta}
        onPress={() => {
          stop();
          router.push('/voice/record');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 32, marginBottom: 8 },
  meterWrap: { marginTop: 48, marginBottom: 8 },
  meterTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  meterFill: { height: 10, borderRadius: 5 },
  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 32 },
  verdictText: { flex: 1 },
  cta: { marginTop: 32 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  deniedTitle: { marginTop: 16 },
  deniedCta: { marginTop: 24 },
});
