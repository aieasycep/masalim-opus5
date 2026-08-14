import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import {
  Button,
  Card,
  Icon,
  LoadingState,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { VOICE_RECORDING } from '@masalim/types';
import { useEnrolmentScript } from '../../src/hooks/queries';
import { useVoiceEnrolment } from '../../src/stores/voice-enrolment';
import { useI18n } from '../../src/i18n';
import { formatDuration } from '../../src/lib/format';
import { VOICE_RECORDING_FORMAT } from '../../src/lib/recording';
import { VOICE_RECORDING_OPTIONS } from '../../src/lib/recording-options';

/**
 * The sixty seconds that matter.
 *
 * The passage comes from the server rather than the bundle: it can be corrected
 * without an App Store release, and shortening or changing it would change what
 * the clone is trained on.
 *
 * Finishing is only offered once the recording passes the server's own minimum
 * length, and the recorder stops itself at the maximum — a parent who keeps
 * reading past two minutes would otherwise upload a file the server rejects,
 * having spent the effort for nothing. The progress bar is real elapsed time
 * against the target, not decoration.
 */
export default function VoiceRecordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();

  const { data: script, isPending } = useEnrolmentScript();
  const update = useVoiceEnrolment((state) => state.update);

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 200);
  const [started, setStarted] = useState(false);

  const seconds = (state.durationMillis ?? 0) / 1000;
  const longEnough = seconds >= VOICE_RECORDING.MIN_SECONDS;

  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  }, []);

  const finish = useCallback(async (): Promise<void> => {
    // Read the duration before stopping; the state hook stops updating after.
    const recorded = (state.durationMillis ?? 0) / 1000;
    await recorder.stop();

    const uri = recorder.uri;
    if (!uri) return;

    update({
      recordingUri: uri,
      durationSeconds: Math.round(recorded),
      contentType: VOICE_RECORDING_FORMAT.contentType,
    });
    router.push('/voice/review');
  }, [recorder, router, state.durationMillis, update]);

  // The recorder stops itself at the ceiling the server will not exceed.
  useEffect(() => {
    if (state.isRecording && seconds >= VOICE_RECORDING.MAX_SECONDS) {
      void finish();
    }
  }, [finish, seconds, state.isRecording]);

  const start = async (): Promise<void> => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStarted(true);
  };

  const restart = async (): Promise<void> => {
    if (recorder.isRecording) await recorder.stop();
    setStarted(false);
    await recorder.prepareToRecordAsync();
  };

  return (
    <Screen scroll={false} footerHeight={200}>
      <ScreenHeader
        title={t('voice.recordEyebrow')}
        onBack={() => {
          if (recorder.isRecording) void recorder.stop();
          router.back();
        }}
      />

      <Text variant="smallBold" tone="muted" style={styles.scriptLabel}>
        {t('voice.recordScriptLabel')}
      </Text>

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : (
        <ScrollView style={styles.script} contentContainerStyle={styles.scriptContent}>
          {(script?.paragraphs ?? []).map((paragraph, index) => (
            <Text key={index} variant="bodyStory" style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </ScrollView>
      )}

      <Card style={styles.panel}>
        <View style={styles.timerRow}>
          {state.isRecording ? (
            <View style={[styles.dot, { backgroundColor: theme.colors.destructive }]} />
          ) : null}
          <Text variant="h5" accessibilityLiveRegion="polite">
            {formatDuration(seconds)}
          </Text>
          <Text variant="caption" tone="muted">
            {` / ${formatDuration(VOICE_RECORDING.TARGET_SECONDS)}`}
          </Text>
        </View>

        <ProgressBar
          value={seconds / VOICE_RECORDING.TARGET_SECONDS}
          style={styles.progress}
          label={state.isRecording ? t('voice.recording') : undefined}
        />

        <Text variant="caption" tone="muted" align="center" style={styles.hint}>
          {t('voice.recordHint')}
        </Text>

        {!started ? (
          <Button
            label={t('voice.recordStart')}
            leadingIcon={
              <Icon name="microphone" size={18} color={theme.colors.primaryForeground} />
            }
            disabled={isPending}
            onPress={() => {
              void start();
            }}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label={t('voice.recordFinish')}
              disabled={!longEnough}
              style={styles.finish}
              onPress={() => {
                void finish();
              }}
            />
            <Button
              label={t('voice.recordRestart')}
              variant="tertiary"
              onPress={() => {
                void restart();
              }}
            />
          </View>
        )}

        {/* Says why "Kaydı Bitir" is not available yet, rather than just dimming it. */}
        {started && !longEnough ? (
          <Text variant="caption" tone="muted" align="center" style={styles.remaining}>
            {t('voice.recordRemaining', {
              count: Math.max(0, Math.ceil(VOICE_RECORDING.MIN_SECONDS - seconds)),
            })}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scriptLabel: { marginTop: 8, marginBottom: 8 },
  script: { flex: 1 },
  scriptContent: { paddingBottom: 24 },
  paragraph: { marginBottom: 16 },
  panel: { gap: 12 },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, alignSelf: 'center', marginRight: 4 },
  progress: { marginTop: 4 },
  hint: { marginBottom: 4 },
  actions: { gap: 8 },
  finish: {},
  remaining: { marginTop: 4 },
});
