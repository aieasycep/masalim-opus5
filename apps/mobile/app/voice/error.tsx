import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Icon, Screen, Text, useTheme } from '@masalim/ui';
import { useVoiceEnrolment } from '../../src/stores/voice-enrolment';
import { useI18n } from '../../src/i18n';

/**
 * The clone did not work.
 *
 * "Kaydın güvende" is a claim, so it has to be true: the uploaded recording
 * outlives a failed clone, and the draft still holds its `assetId`. Retrying
 * therefore goes back to the review screen and re-submits the same asset under
 * the same idempotency key — it does not send the parent back to read a minute
 * of text a second time (§21, §46).
 *
 * The reason shown is whatever the job reported, already mapped to copy a parent
 * can act on: too quiet, too noisy, too short. A raw code never reaches this
 * screen.
 */
export default function VoiceErrorScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();
  const { code } = useLocalSearchParams<{ code?: string }>();

  const draft = useVoiceEnrolment((state) => state.draft);
  const reset = useVoiceEnrolment((state) => state.reset);

  const reason = code ? errorCopy({ name: 'ApiError', code }).message : errorCopy(null).message;

  // Only true while the uploaded bytes are still ours to resubmit.
  const canRetryWithoutRecording = draft.assetId !== null && draft.voiceProfileId !== null;

  return (
    <Screen>
      <View style={styles.body}>
        <View style={[styles.mark, { backgroundColor: theme.colors.muted }]}>
          <Icon name="alert" size={36} color={theme.colors.destructive} />
        </View>

        <Text variant="h4" align="center" style={styles.title}>
          {t('voice.errorTitle')}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {reason}
        </Text>

        {canRetryWithoutRecording ? (
          <Card style={styles.safe}>
            <Icon name="check" size={18} color={theme.colors.success} />
            <Text variant="small" tone="muted" style={styles.safeText}>
              {t('voice.errorSafe')}
            </Text>
          </Card>
        ) : null}

        <Button
          label={t('voice.errorRetry')}
          style={styles.cta}
          onPress={() => {
            // Back to review: the same asset, the same key, no second reading.
            router.replace(canRetryWithoutRecording ? '/voice/review' : '/voice/record');
          }}
        />

        <Button
          label={t('voice.errorLater')}
          variant="tertiary"
          onPress={() => {
            reset();
            router.replace('/voice');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { marginBottom: 4 },
  safe: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, alignSelf: 'stretch' },
  safeText: { flex: 1 },
  cta: { marginTop: 28, alignSelf: 'stretch' },
});
