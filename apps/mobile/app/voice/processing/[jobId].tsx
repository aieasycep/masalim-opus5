import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, watchJob, type ApiError } from '@masalim/api-client';
import type { AIJobDto } from '@masalim/types';
import { Button, Icon, ProgressBar, Screen, Text, useTheme } from '@masalim/ui';
import { http } from '../../../src/lib/api';
import { useVoiceEnrolment } from '../../../src/stores/voice-enrolment';
import { useI18n } from '../../../src/i18n';

/**
 * The clone, in progress.
 *
 * Cloning takes long enough that watching it is not the point — the copy says so
 * plainly, and a push notification arrives when it lands. Leaving cancels
 * nothing; the job is the server's.
 *
 * Progress is the job's real completed steps, and the caption under the bar is
 * the server's own step key.
 */
export default function VoiceProcessingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const client = useQueryClient();
  const { t } = useI18n();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  const draft = useVoiceEnrolment((state) => state.draft);
  const [job, setJob] = useState<AIJobDto | null>(null);

  useEffect(() => {
    if (!jobId) return;

    return watchJob(http, jobId, {
      onProgress: setJob,
      onSettled: (settled) => {
        setJob(settled);
        void client.invalidateQueries({ queryKey: queryKeys.voices.all });

        if (settled.status === 'COMPLETED') {
          const voiceId = settled.entityId ?? draft.voiceProfileId;
          if (voiceId) {
            router.replace({ pathname: '/voice/success/[id]', params: { id: voiceId } });
          }
          return;
        }

        router.replace({
          pathname: '/voice/error',
          params: settled.errorCode ? { code: settled.errorCode } : {},
        });
      },
      onError: (cause: ApiError) => {
        router.replace({ pathname: '/voice/error', params: { code: cause.code } });
      },
    });
  }, [client, draft.voiceProfileId, jobId, router]);

  const progress = job ? job.completedSteps / Math.max(1, job.totalSteps) : 0;

  return (
    <Screen>
      <View style={styles.body}>
        <View style={[styles.mark, { backgroundColor: theme.colors.secondary }]}>
          <Icon name="microphone" size={36} color={theme.colors.primary} />
        </View>

        <Text variant="h4" align="center" style={styles.title}>
          {t('voice.processingTitle')}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t('voice.processingBody')}
        </Text>

        <ProgressBar
          value={progress}
          style={styles.progress}
          {...(job?.currentStepKey ? { label: t(job.currentStepKey) } : {})}
        />

        {job?.currentStepKey ? (
          <Text variant="small" tone="muted" align="center" accessibilityLiveRegion="polite">
            {t(job.currentStepKey)}
          </Text>
        ) : null}

        <Text variant="caption" tone="muted" align="center" style={styles.leave}>
          {t('voice.processingLeave')}
        </Text>

        <Button
          label={t('common.done')}
          variant="tertiary"
          style={styles.cta}
          onPress={() => {
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
  progress: { alignSelf: 'stretch', marginTop: 32, marginBottom: 4 },
  leave: { marginTop: 24 },
  cta: { marginTop: 16 },
});
