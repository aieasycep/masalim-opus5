import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useAudioPlayer } from 'expo-audio';
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  LoadingState,
  OptionCard,
  Screen,
  ScreenHeader,
  Text,
  useToast,
} from '@masalim/ui';
import { ANALYTICS_EVENTS, type NarrationDto } from '@masalim/types';
import { isApiError } from '@masalim/api-client';
import { analytics } from '../../../src/lib/analytics';
import {
  useCreateNarration,
  useDeleteNarration,
  useEntitlements,
  useNarrations,
  useNarrators,
} from '../../../src/hooks/queries';
import { useI18n } from '../../../src/i18n';
import { formatDuration } from '../../../src/lib/format';

/**
 * Giving a story a voice.
 *
 * The narrator list shows every option including the ones this account cannot
 * use, locked rather than hidden, and tapping a locked one opens the paywall.
 * This is where the parent-voice wall genuinely lands — the Voice Studio let
 * them record and hear a sample for free, and the charge is for *using* that
 * voice on a story. The server enforces the identical boundary, so a client that
 * ignored the lock would simply be refused.
 *
 * A story can carry several narrations: the system voice tonight, a mother's
 * voice next week. Adding one never regenerates the text.
 */
export default function NarrateScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id: storyId } = useLocalSearchParams<{ id: string }>();

  const { data: narrators = [], isPending } = useNarrators();
  const { data: narrations = [] } = useNarrations(storyId ?? null);
  const { data: entitlements } = useEntitlements();
  const createNarration = useCreateNarration();
  const deleteNarration = useDeleteNarration();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NarrationDto | null>(null);

  const player = useAudioPlayer(previewUrl ? { uri: previewUrl } : null);

  const canUseParentVoice = entitlements?.entitlements.parent_voice_clone ?? false;
  const canUsePremiumVoices = entitlements?.entitlements.premium_system_voices ?? false;

  const preview = (url: string | null): void => {
    if (!url) return;
    setPreviewUrl(url);
    player.play();
  };

  const narrate = (voice: { voiceProfileId?: string; systemVoiceId?: string }): void => {
    if (!storyId) return;

    const isParentVoice = Boolean(voice.voiceProfileId);

    // The attempt, so the gap to `narration_created` shows refusals (quota,
    // entitlement) that never became a narration.
    analytics.capture(ANALYTICS_EVENTS.NARRATION_REQUESTED, {
      is_parent_voice: isParentVoice,
      existing_narration_count: narrations.length,
    });

    createNarration.mutate(
      {
        storyId,
        input: {
          ...(voice.voiceProfileId ? { voiceProfileId: voice.voiceProfileId } : {}),
          ...(voice.systemVoiceId ? { systemVoiceId: voice.systemVoiceId } : {}),
          idempotencyKey: Crypto.randomUUID(),
        },
      },
      {
        onSuccess: ({ job }) => {
          analytics.capture(ANALYTICS_EVENTS.NARRATION_CREATED, {
            is_parent_voice: isParentVoice,
          });
          router.push({
            pathname: '/generating/[jobId]',
            params: { jobId: job.id, storyId },
          });
        },
        onError: (cause) => {
          analytics.capture(ANALYTICS_EVENTS.NARRATION_FAILED, {
            is_parent_voice: isParentVoice,
            error_code: isApiError(cause) ? cause.code : null,
          });
          toast.show({ message: errorCopy(cause).message, tone: 'error' });
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('story.renarrate')}
        onBack={() => {
          router.back();
        }}
      />

      {/* What the story already has, so nobody narrates the same voice twice. */}
      {narrations.length > 0 ? (
        <View style={styles.existing}>
          <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
            {t('story.narratedBy', { name: '' }).trim()}
          </Text>

          {narrations.map((narration) => (
            <Card key={narration.id} style={styles.narrationRow}>
              <Avatar name={narration.narratorLabel} kind="systemVoice" size={36} />
              <View style={styles.narrationBody}>
                <Text variant="title" numberOfLines={1}>
                  {narration.narratorLabel}
                </Text>
                {narration.durationSeconds !== null ? (
                  <Text variant="caption" tone="muted">
                    {formatDuration(narration.durationSeconds)}
                  </Text>
                ) : (
                  <Badge label={t('story.statusGenerating')} tone="neutral" />
                )}
              </View>
              <IconButton
                name="trash"
                accessibilityLabel={`${t('common.delete')} — ${narration.narratorLabel}`}
                onPress={() => {
                  setDeleting(narration);
                }}
              />
            </Card>
          ))}
        </View>
      ) : null}

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('storyCreate.step5Title')}
      </Text>

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : narrators.length === 0 ? (
        <EmptyState
          icon="microphone"
          title={t('empty.voicesTitle')}
          description={t('empty.voicesBody')}
          actionLabel={t('empty.voicesCta')}
          onAction={() => {
            router.push('/voice');
          }}
        />
      ) : (
        narrators.map((option) => {
          if (option.kind === 'PARENT') {
            return (
              <OptionCard
                key={option.voice.id}
                title={option.voice.displayName}
                description={t('storyCreate.personalVoiceBadge')}
                leading={<Avatar name={option.voice.displayName} kind="parentVoice" size={40} />}
                locked={!canUseParentVoice}
                lockedLabel={t('common.premium')}
                disabled={createNarration.isPending}
                style={styles.option}
                onPress={() => {
                  // The wall lands here, at the point of use.
                  if (!canUseParentVoice) {
                    router.push('/subscription');
                    return;
                  }
                  preview(option.voice.previewUrl);
                  narrate({ voiceProfileId: option.voice.id });
                }}
              />
            );
          }

          const locked = option.voice.premiumOnly && !canUsePremiumVoices;

          return (
            <OptionCard
              key={option.voice.id}
              title={option.voice.displayName}
              description={t(option.voice.descriptionKey)}
              leading={<Avatar name={option.voice.displayName} kind="systemVoice" size={40} />}
              locked={locked}
              lockedLabel={t('common.premium')}
              disabled={createNarration.isPending}
              style={styles.option}
              onPress={() => {
                if (locked) {
                  router.push('/subscription');
                  return;
                }
                preview(option.voice.previewUrl);
                narrate({ systemVoiceId: option.voice.id });
              }}
            />
          );
        })
      )}

      <ConfirmDialog
        visible={deleting !== null}
        title={t('common.delete')}
        message={t('story.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        tone="destructive"
        loading={deleteNarration.isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target || !storyId) return;
          deleteNarration.mutate(
            { id: target.id, storyId },
            {
              onSuccess: () => {
                setDeleting(null);
              },
              onError: (cause) => {
                setDeleting(null);
                toast.show({ message: errorCopy(cause).message, tone: 'error' });
              },
            },
          );
        }}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  existing: { gap: 10, marginBottom: 8 },
  sectionLabel: { marginTop: 16, marginBottom: 10 },
  narrationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  narrationBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
  option: { marginBottom: 10 },
});
