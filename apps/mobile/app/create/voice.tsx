import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { Avatar, EmptyState, OptionCard, Text } from '@masalim/ui';
import { analytics } from '../../src/lib/analytics';
import { useEntitlements, useNarrators } from '../../src/hooks/queries';
import { useWizard } from '../../src/stores/wizard';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

/**
 * Step 5 — who reads the story.
 *
 * Every narrator is listed, including the premium ones a free account cannot
 * use. They are locked rather than hidden, and tapping a locked option opens the
 * paywall: a parent should be able to see what Premium gives them at the moment
 * they would want it, rather than discovering it after paying attention
 * elsewhere (§36).
 *
 * Previews play from here. Choosing the voice that will read to your child for
 * the next year on the strength of a name alone is not a choice at all.
 */
export default function CreateVoiceStep() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: narrators = [], isPending } = useNarrators();
  const { data: entitlements } = useEntitlements();
  const draft = useWizard((state) => state.draft);
  const update = useWizard((state) => state.update);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const player = useAudioPlayer(previewUrl ? { uri: previewUrl } : null);
  const canUseParentVoice = entitlements?.entitlements.parent_voice_clone ?? false;
  const canUsePremiumVoices = entitlements?.entitlements.premium_system_voices ?? false;

  const chosen = draft.voiceProfileId ?? draft.systemVoiceId;

  const preview = (url: string | null): void => {
    if (!url) return;
    setPreviewUrl(url);
    player.play();
  };

  return (
    <WizardStep
      step={5}
      title={t('storyCreate.step5Title')}
      canContinue={chosen !== null}
      onContinue={() => {
        analytics.capture(ANALYTICS_EVENTS.STORY_CREATION_STEP_COMPLETED, {
          step: 'voice',
          step_index: 5,
          voice_kind: draft.voiceProfileId ? 'parent' : 'system',
        });
        router.push('/create/summary');
      }}
      footerNote={canUseParentVoice ? undefined : t('storyCreate.voicePremiumNote')}
    >
      {!isPending && narrators.length === 0 ? (
        <EmptyState
          icon="microphone"
          title={t('storyCreate.noVoices')}
          actionLabel={t('empty.voicesCta')}
          onAction={() => {
            router.push('/voice');
          }}
        />
      ) : null}

      {narrators.map((option) => {
        if (option.kind === 'PARENT') {
          return (
            <OptionCard
              key={option.voice.id}
              title={option.voice.displayName}
              description={t('storyCreate.personalVoiceBadge')}
              leading={<Avatar name={option.voice.displayName} kind="parentVoice" size={40} />}
              selected={draft.voiceProfileId === option.voice.id}
              locked={!canUseParentVoice}
              lockedLabel={t('common.premium')}
              onPress={() => {
                if (!canUseParentVoice) {
                  router.push('/subscription');
                  return;
                }
                update({ voiceProfileId: option.voice.id, systemVoiceId: null });
                preview(option.voice.previewUrl);
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
            selected={draft.systemVoiceId === option.voice.id}
            locked={locked}
            lockedLabel={t('common.premium')}
            onPress={() => {
              if (locked) {
                router.push('/subscription');
                return;
              }
              update({ systemVoiceId: option.voice.id, voiceProfileId: null });
              preview(option.voice.previewUrl);
            }}
          />
        );
      })}

      {!canUseParentVoice ? (
        <Text
          variant="small"
          tone="primary"
          align="center"
          accessibilityRole="link"
          style={styles.createVoice}
          onPress={() => {
            router.push('/voice');
          }}
        >
          {t('storyCreate.createMotherVoice')}
        </Text>
      ) : null}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  createVoice: { marginTop: 16, paddingVertical: 8 },
});
