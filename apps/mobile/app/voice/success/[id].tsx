import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, Icon, LoadingState, Screen, Text, useTheme } from '@masalim/ui';
import { useEntitlements, useVoice } from '../../../src/hooks/queries';
import { useVoiceEnrolment } from '../../../src/stores/voice-enrolment';
import { useI18n } from '../../../src/i18n';

/**
 * The voice is ready.
 *
 * A free account reaches this screen and hears the sample — that was the promise
 * made on the intro screen, and breaking it here is exactly the surprise wall the
 * product is not allowed to have. The upgrade prompt belongs at the point of use,
 * so "Bu Sesi Kullan" is where a free parent meets it, on their way to narrating
 * a specific story (§36).
 */
export default function VoiceSuccessScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: voice, isPending } = useVoice(id ?? null);
  const { data: entitlements } = useEntitlements();
  const reset = useVoiceEnrolment((state) => state.reset);

  const player = useAudioPlayer(voice?.previewUrl ? { uri: voice.previewUrl } : null);
  const status = useAudioPlayerStatus(player);

  const canUse = entitlements?.entitlements.parent_voice_clone ?? false;

  if (isPending || !voice) {
    return (
      <Screen>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.body}>
        <View style={[styles.mark, { backgroundColor: theme.colors.secondary }]}>
          <Icon name="check" size={36} color={theme.colors.success} />
        </View>

        <Text variant="h4" align="center" style={styles.title}>
          {t('voice.successTitle', { name: voice.displayName })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t('voice.successBody')}
        </Text>

        {voice.previewUrl ? (
          <Button
            label={t('voice.successSample')}
            variant="secondary"
            leadingIcon={
              <Icon
                name={status.playing ? 'pause' : 'play'}
                size={18}
                color={theme.colors.primary}
              />
            }
            style={styles.sample}
            onPress={() => {
              if (status.playing) {
                player.pause();
                return;
              }
              if (status.didJustFinish || status.currentTime >= status.duration) {
                void player.seekTo(0);
              }
              player.play();
            }}
          />
        ) : null}

        <Button
          label={t('voice.successUse')}
          style={styles.cta}
          onPress={() => {
            reset();
            // The wall lands here, at the point of use — never before recording.
            if (!canUse) {
              router.replace('/subscription');
              return;
            }
            router.replace('/create');
          }}
        />

        <Button
          label={t('common.done')}
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
  sample: { marginTop: 28, alignSelf: 'stretch' },
  cta: { marginTop: 16, alignSelf: 'stretch' },
});
