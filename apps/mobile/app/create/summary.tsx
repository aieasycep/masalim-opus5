import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { AGE_BAND_RULES } from '@masalim/types';
import type { CreateStoryInput } from '@masalim/validation';
import { Card, Divider, Text } from '@masalim/ui';
import { useChildren, useCreateStory, useNarrators } from '../../src/hooks/queries';
import { useWizard } from '../../src/stores/wizard';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

/**
 * Step 6 — review and submit.
 *
 * The idempotency key is generated once, when the screen mounts, and reused on
 * every retry. A parent who taps twice because the first tap seemed not to
 * register must not end up with two stories — and must not burn two of their
 * four monthly generations finding out.
 *
 * The draft is only cleared once the server has accepted the story. Clearing it
 * on submit would lose six steps of work to a failed request.
 */
export default function CreateSummaryStep() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const { data: children = [] } = useChildren();
  const { data: narrators = [] } = useNarrators();
  const draft = useWizard((state) => state.draft);
  const reset = useWizard((state) => state.reset);
  const createStory = useCreateStory();

  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  const child = children.find((candidate) => candidate.id === draft.childId) ?? null;
  const narratorName = narrators
    .map((option) =>
      option.kind === 'PARENT'
        ? option.voice.id === draft.voiceProfileId
          ? option.voice.displayName
          : null
        : option.voice.id === draft.systemVoiceId
          ? option.voice.displayName
          : null,
    )
    .find((name): name is string => name !== null);

  const submit = (): void => {
    if (!draft.ageRange) return;
    setError(null);

    const input: CreateStoryInput = {
      ...(draft.childId ? { childId: draft.childId } : {}),
      heroName: draft.heroName.trim(),
      heroType: draft.heroType,
      themes: draft.themes,
      ageRange: draft.ageRange,
      durationTarget: draft.durationTarget,
      ...(draft.customPrompt.trim().length > 0
        ? { customPrompt: draft.customPrompt.trim() }
        : {}),
      advancedSettings: {
        ...(draft.educationalGoal.trim().length > 0
          ? { educationalGoal: draft.educationalGoal.trim() }
          : {}),
        teachNewWords: draft.teachNewWords,
        calmBedtimeEnding: draft.calmBedtimeEnding,
        ...(draft.humourLevel ? { humourLevel: draft.humourLevel } : {}),
        ...(draft.fantasyLevel ? { fantasyLevel: draft.fantasyLevel } : {}),
      },
      ...(draft.voiceProfileId ? { voiceProfileId: draft.voiceProfileId } : {}),
      ...(draft.systemVoiceId ? { systemVoiceId: draft.systemVoiceId } : {}),
      idempotencyKey,
    };

    createStory.mutate(input, {
      onSuccess: ({ story, job }) => {
        reset();
        router.replace({
          pathname: '/generating/[jobId]',
          params: { jobId: job.id, storyId: story.id },
        });
      },
      onError: (cause: unknown) => {
        setError(errorCopy(cause).message);
      },
    });
  };

  return (
    <WizardStep
      step={6}
      title={t('storyCreate.summaryTitle')}
      canContinue={draft.ageRange !== null && draft.heroName.trim().length > 0}
      continueLabel={t('storyCreate.submit')}
      submitting={createStory.isPending}
      footerNote={t('storyCreate.submitHint')}
      onContinue={submit}
    >
      <Card variant="flat" padding={16}>
        <SummaryRow
          label={t('storyCreate.step1Title')}
          value={child?.name ?? t('storyCreate.generalStory')}
        />
        <Divider spacing={10} />
        <SummaryRow label={t('storyCreate.heroNameLabel')} value={draft.heroName} />
        <Divider spacing={10} />
        <SummaryRow
          label={t('storyCreate.step3Title')}
          value={draft.themes.map((theme) => t(`themes.${theme}`)).join(', ')}
        />
        <Divider spacing={10} />
        <SummaryRow
          label={t('storyCreate.ageGroupLabel')}
          value={draft.ageRange ? AGE_BAND_RULES[draft.ageRange].label : ''}
        />
        <Divider spacing={10} />
        <SummaryRow
          label={t('storyCreate.durationLabel')}
          value={t(`storyCreate.duration${titleCase(draft.durationTarget)}`)}
        />
        {narratorName ? (
          <>
            <Divider spacing={10} />
            <SummaryRow label={t('storyCreate.step5Title')} value={narratorName} />
          </>
        ) : null}
      </Card>

      {draft.customPrompt.trim().length > 0 ? (
        <Card variant="muted" padding={14} style={styles.idea}>
          <Text variant="caption" tone="muted">
            {t('storyCreate.ideaLabel')}
          </Text>
          <Text variant="small" style={styles.ideaText}>
            {draft.customPrompt.trim()}
          </Text>
        </Card>
      ) : null}

      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </WizardStep>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="small" tone="muted" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="smallBold" style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowLabel: { flex: 1 },
  rowValue: { flex: 1.4, textAlign: 'right' },
  idea: { marginTop: 12, gap: 4 },
  ideaText: { marginTop: 2 },
});
