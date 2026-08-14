import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, watchJob, type ApiError } from '@masalim/api-client';
import type { AIJobDto } from '@masalim/types';
import { Button, palette, ProgressBar, Text, useTheme } from '@masalim/ui';
import { http } from '../../src/lib/api';
import { useI18n } from '../../src/i18n';

/**
 * The generation screen.
 *
 * Night-themed, because it is watched at bedtime with a child alongside. The
 * progress bar is driven by real completed steps from the server, and the label
 * under it is the server's own step key — so a parent reading "Çocuklara
 * uygunluk kontrol ediliyor" is being told what is genuinely happening rather
 * than watching an animation on a timer (§29, §57).
 *
 * The rotating messages above are decorative and clearly separate from that.
 * Leaving the screen does not cancel anything: the job runs on the server, and
 * the notice says so.
 */
export default function GeneratingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const client = useQueryClient();
  const { t, tList, errorCopy } = useI18n();
  const { jobId, storyId } = useLocalSearchParams<{ jobId: string; storyId?: string }>();

  const [job, setJob] = useState<AIJobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // The catalogue holds an array of these; `tList` is the translator's accessor.
  const messages = useMemo(() => tList('storyGenerating.messages'), [tList]);

  useEffect(() => {
    if (!jobId) return;

    const stop = watchJob(
      http,
      jobId,
      {
        onProgress: setJob,
        onSettled: (settled) => {
          setJob(settled);

          if (settled.status === 'COMPLETED') {
            void client.invalidateQueries({ queryKey: queryKeys.stories.all });
            void client.invalidateQueries({ queryKey: queryKeys.app.home });

            const target = settled.entityId ?? storyId;
            if (target) {
              router.replace({ pathname: '/story/[id]', params: { id: target } });
            }
            return;
          }

          setError(
            settled.errorCode
              ? errorCopy({ name: 'ApiError', code: settled.errorCode }).message
              : errorCopy(null).message,
          );
        },
        onError: (cause: ApiError) => {
          setError(errorCopy(cause).message);
        },
      },
    );

    return stop;
  }, [client, errorCopy, jobId, router, storyId]);

  // Cross-fades the decorative message every few seconds.
  useEffect(() => {
    if (messages.length === 0) return;

    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 4000);

    return () => {
      clearInterval(timer);
    };
  }, [fade, messages.length]);

  const progress = job ? job.completedSteps / Math.max(1, job.totalSteps) : 0;

  return (
    <LinearGradient
      colors={[...theme.gradients.night.colors]}
      locations={[...theme.gradients.night.locations]}
      start={theme.gradients.night.start}
      end={theme.gradients.night.end}
      style={styles.root}
    >
      <View style={styles.body}>
        {error ? (
          <>
            <Text variant="h4" align="center" style={{ color: palette.cream }}>
              {errorCopy(null).title}
            </Text>
            <Text variant="body" align="center" style={[styles.message, { color: palette.lavenderLight }]}>
              {error}
            </Text>
            <Button
              label={t('common.back')}
              variant="secondary"
              fullWidth={false}
              style={styles.action}
              onPress={() => {
                router.replace('/(tabs)');
              }}
            />
          </>
        ) : (
          <>
            <Text variant="hero" style={styles.emoji}>
              ✨
            </Text>

            <Animated.View style={{ opacity: fade }}>
              <Text variant="h5" align="center" style={{ color: palette.cream }}>
                {messages[messageIndex] ?? ''}
              </Text>
            </Animated.View>

            <ProgressBar
              value={progress}
              label={job?.currentStepKey ? t(job.currentStepKey) : undefined}
              trackColor={`${palette.lavender}33`}
              fillColor={palette.lavender}
              style={styles.progress}
            />

            {job?.currentStepKey ? (
              <Text
                variant="small"
                align="center"
                accessibilityLiveRegion="polite"
                style={{ color: palette.lavenderLight }}
              >
                {t(job.currentStepKey)}
              </Text>
            ) : null}

            <Text
              variant="caption"
              align="center"
              style={[styles.notice, { color: palette.lavender }]}
            >
              {t('storyGenerating.backgroundNotice')}
            </Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emoji: { marginBottom: 24 },
  message: { marginTop: 8 },
  progress: { marginTop: 28, marginBottom: 4 },
  notice: { marginTop: 32, maxWidth: 280 },
  action: { marginTop: 24 },
});
