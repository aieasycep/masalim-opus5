import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import {
  Button,
  Card,
  Icon,
  IconButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { VOICE_CONSENT_VERSION } from '@masalim/validation';
import { ApiError, uploadFile } from '@masalim/api-client';
import { ANALYTICS_EVENTS, ERROR_CODES } from '@masalim/types';
import { useCreateVoice, useSubmitVoiceRecording } from '../../src/hooks/queries';
import { useVoiceEnrolment } from '../../src/stores/voice-enrolment';
import { api } from '../../src/lib/api';
import { analytics } from '../../src/lib/analytics';
import { useI18n } from '../../src/i18n';
import { formatDuration } from '../../src/lib/format';

/** The codes the server's quality control answers with, from `analyseVoiceSample`. */
const QUALITY_REJECTION_CODES: readonly string[] = [
  ERROR_CODES.AUDIO_TOO_SHORT,
  ERROR_CODES.AUDIO_TOO_LONG,
  ERROR_CODES.AUDIO_TOO_QUIET,
  ERROR_CODES.AUDIO_TOO_NOISY,
  ERROR_CODES.AUDIO_CLIPPED,
  ERROR_CODES.AUDIO_MOSTLY_SILENT,
  ERROR_CODES.AUDIO_FILE_CORRUPT,
];

/**
 * Listen back, then commit.
 *
 * The three server calls happen here in a fixed order, and each one is recorded
 * in the draft as it succeeds: create the profile, upload the bytes, submit the
 * recording. That is what makes a failure recoverable — a clone that fails after
 * the upload is retried against the same `assetId`, so the passage is never read
 * a second time (§21, §46). Retrying a submit reuses one idempotency key, so a
 * flaky connection cannot queue two clone jobs.
 */
export default function VoiceReviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();

  const draft = useVoiceEnrolment((state) => state.draft);
  const update = useVoiceEnrolment((state) => state.update);
  const createVoice = useCreateVoice();
  const submitRecording = useSubmitVoiceRecording();

  const [uploadFraction, setUploadFraction] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useAudioPlayer(draft.recordingUri ? { uri: draft.recordingUri } : null);
  const status = useAudioPlayerStatus(player);

  const submit = async (): Promise<void> => {
    if (!draft.recordingUri || !draft.ownerType) return;

    setBusy(true);
    setError(null);

    // Which of the three calls was in flight, so a failure is reported against
    // the step it happened in rather than guessed from the code.
    let phase: 'profile' | 'upload' | 'submit' = 'profile';

    try {
      // 1. The profile. Reused on a retry rather than creating a second one.
      const voiceProfileId =
        draft.voiceProfileId ??
        (
          await createVoice.mutateAsync({
            ownerType: draft.ownerType,
            displayName: draft.displayName.trim(),
            consentVersion: VOICE_CONSENT_VERSION,
            consentAccepted: true,
          })
        ).id;
      update({ voiceProfileId });

      // 2. The bytes. Survives a failed clone so the passage is read once.
      phase = 'upload';
      const assetId =
        draft.assetId ??
        (await uploadFile(api, {
          uri: draft.recordingUri,
          kind: 'VOICE_RECORDING',
          contentType: draft.contentType,
          onProgress: setUploadFraction,
        }));
      update({ assetId });

      // 3. The clone job, under a key held for the whole enrolment.
      phase = 'submit';
      const idempotencyKey = draft.idempotencyKey ?? Crypto.randomUUID();
      update({ idempotencyKey });

      const { job } = await submitRecording.mutateAsync({
        id: voiceProfileId,
        input: { assetId, durationSeconds: draft.durationSeconds, idempotencyKey },
      });

      router.replace({ pathname: '/voice/processing/[jobId]', params: { jobId: job.id } });
    } catch (cause) {
      // Quality control rejections land here too, already as friendly codes.
      const code = cause instanceof ApiError ? cause.code : 'UNKNOWN';

      if (QUALITY_REJECTION_CODES.includes(code)) {
        analytics.capture(ANALYTICS_EVENTS.VOICE_RECORDING_REJECTED, {
          reason_code: code,
          duration_seconds: draft.durationSeconds,
          owner_type: draft.ownerType,
        });
      } else if (phase === 'upload') {
        analytics.capture(ANALYTICS_EVENTS.VOICE_UPLOAD_FAILED, {
          error_code: code,
          duration_seconds: draft.durationSeconds,
        });
      } else {
        analytics.capture(ANALYTICS_EVENTS.VOICE_CREATION_FAILED, {
          error_code: code,
          owner_type: draft.ownerType,
        });
      }

      setError(errorCopy(cause).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footerHeight={150}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h4" align="center" style={styles.title}>
        {t('voice.reviewTitle')}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {t('voice.reviewBody')}
      </Text>

      <Card style={styles.player}>
        <IconButton
          name={status.playing ? 'pause' : 'play'}
          accessibilityLabel={t(status.playing ? 'voice.recordPause' : 'voice.menuListen')}
          variant="primary"
          size={56}
          iconSize={22}
          onPress={() => {
            if (status.playing) {
              player.pause();
              return;
            }
            // Replay from the top once it has run to the end.
            if (status.didJustFinish || status.currentTime >= status.duration) {
              void player.seekTo(0);
            }
            player.play();
          }}
        />

        <View style={styles.playerBody}>
          <Text variant="title">{draft.displayName}</Text>
          <Text variant="caption" tone="muted">
            {formatDuration(draft.durationSeconds)}
          </Text>
        </View>
      </Card>

      {busy && uploadFraction > 0 && uploadFraction < 1 ? (
        <ProgressBar value={uploadFraction} style={styles.upload} />
      ) : null}

      {error ? (
        <Card style={styles.error}>
          <Icon name="alert" size={18} color={theme.colors.destructive} />
          <Text
            variant="small"
            tone="muted"
            style={styles.errorText}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        </Card>
      ) : null}

      <Button
        label={t('voice.reviewUse')}
        loading={busy}
        style={styles.cta}
        onPress={() => {
          void submit();
        }}
      />

      <Button
        label={t('voice.reviewAgain')}
        variant="tertiary"
        disabled={busy}
        onPress={() => {
          player.pause();
          // A new take needs a new asset; the old one is no longer the recording.
          update({ recordingUri: null, assetId: null, durationSeconds: 0 });
          router.replace('/voice/record');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 24, marginBottom: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 32 },
  playerBody: { flex: 1, gap: 4 },
  upload: { marginTop: 20 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20 },
  errorText: { flex: 1 },
  cta: { marginTop: 32, marginBottom: 8 },
});
