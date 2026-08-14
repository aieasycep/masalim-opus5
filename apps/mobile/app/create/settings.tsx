import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AGE_BAND_RULES,
  AGE_RANGES,
  FANTASY_LEVELS,
  HUMOUR_LEVELS,
  STORY_DURATIONS,
  ageRangeFromAge,
  type AgeRange,
  type StoryDuration,
} from '@masalim/types';
import { MAX_EDUCATIONAL_GOAL_LENGTH } from '@masalim/validation';
import { Card, Chip, ChipGroup, Input, ListItem, OptionCard, Text } from '@masalim/ui';
import { useChildren } from '../../src/hooks/queries';
import { useWizard } from '../../src/stores/wizard';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

const DURATION_KEYS: Record<StoryDuration, { title: string; sub: string }> = {
  SHORT: { title: 'storyCreate.durationShort', sub: 'storyCreate.durationShortSub' },
  MEDIUM: { title: 'storyCreate.durationMedium', sub: 'storyCreate.durationMediumSub' },
  LONG: { title: 'storyCreate.durationLong', sub: 'storyCreate.durationLongSub' },
};

/**
 * Step 4 — age band, length and the advanced accordion.
 *
 * The age band is preselected from the child's own age, because it is the one
 * setting that genuinely changes the story — page count, sentence length,
 * vocabulary and how much tension is allowed all follow from it — and asking a
 * parent to pick it again when the app already knows is friction for nothing.
 *
 * Advanced settings stay collapsed. They are real controls that reach the
 * prompt, but a parent who opens none of them still gets a complete story.
 */
export default function CreateSettingsStep() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: children = [] } = useChildren();
  const draft = useWizard((state) => state.draft);
  const update = useWizard((state) => state.update);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const child = children.find((candidate) => candidate.id === draft.childId) ?? null;
  const suggestedAge: AgeRange | null =
    child?.ageInYears !== null && child?.ageInYears !== undefined
      ? ageRangeFromAge(child.ageInYears)
      : (child?.ageRange ?? null);

  const ageRange = draft.ageRange ?? suggestedAge;

  return (
    <WizardStep
      step={4}
      title={t('storyCreate.step4Title')}
      subtitle={t('storyCreate.step4Subtitle')}
      canContinue={ageRange !== null}
      footerNote={t('storyCreate.safetyNote')}
      onContinue={() => {
        if (ageRange) update({ ageRange });
        router.push('/create/voice');
      }}
    >
      <Text variant="smallBold" tone="muted">
        {t('storyCreate.ageGroupLabel')}
      </Text>
      <ChipGroup>
        {AGE_RANGES.map((range) => (
          <Chip
            key={range}
            label={AGE_BAND_RULES[range].label}
            selected={ageRange === range}
            onPress={() => {
              update({ ageRange: range });
            }}
          />
        ))}
      </ChipGroup>

      <Text variant="smallBold" tone="muted" style={styles.label}>
        {t('storyCreate.durationLabel')}
      </Text>
      {STORY_DURATIONS.map((duration) => (
        <OptionCard
          key={duration}
          title={t(DURATION_KEYS[duration].title)}
          description={t(DURATION_KEYS[duration].sub)}
          selected={draft.durationTarget === duration}
          onPress={() => {
            update({ durationTarget: duration });
          }}
        />
      ))}

      <Card variant="flat" padding={12} style={styles.advanced}>
        <ListItem
          title={t('storyCreate.advancedLabel')}
          icon={advancedOpen ? 'up' : 'down'}
          showChevron={false}
          onPress={() => {
            setAdvancedOpen((current) => !current);
          }}
        />

        {advancedOpen ? (
          <View style={styles.advancedBody}>
            <Input
              label={t('storyCreate.educationalGoalLabel')}
              placeholder={t('storyCreate.educationalGoalPlaceholder')}
              value={draft.educationalGoal}
              onChangeText={(value) => {
                update({ educationalGoal: value });
              }}
              maxLength={MAX_EDUCATIONAL_GOAL_LENGTH}
            />

            <ListItem
              title={t('storyCreate.teachNewWords')}
              toggle={{
                value: draft.teachNewWords,
                onValueChange: (value) => {
                  update({ teachNewWords: value });
                },
              }}
            />
            <ListItem
              title={t('storyCreate.calmEnding')}
              toggle={{
                value: draft.calmBedtimeEnding,
                onValueChange: (value) => {
                  update({ calmBedtimeEnding: value });
                },
              }}
            />

            <Text variant="smallBold" tone="muted" style={styles.label}>
              {t('storyCreate.humourLabel')}
            </Text>
            <ChipGroup>
              {HUMOUR_LEVELS.map((level) => (
                <Chip
                  key={level}
                  size="small"
                  label={t(`level.${level.toLowerCase()}`)}
                  selected={draft.humourLevel === level}
                  onPress={() => {
                    update({ humourLevel: draft.humourLevel === level ? null : level });
                  }}
                />
              ))}
            </ChipGroup>

            <Text variant="smallBold" tone="muted" style={styles.label}>
              {t('storyCreate.fantasyLabel')}
            </Text>
            <ChipGroup>
              {FANTASY_LEVELS.map((level) => (
                <Chip
                  key={level}
                  size="small"
                  label={t(`level.${level.toLowerCase()}`)}
                  selected={draft.fantasyLevel === level}
                  onPress={() => {
                    update({ fantasyLevel: draft.fantasyLevel === level ? null : level });
                  }}
                />
              ))}
            </ChipGroup>
          </View>
        ) : null}
      </Card>
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 20, marginBottom: 8 },
  advanced: { marginTop: 20 },
  advancedBody: { gap: 8, paddingTop: 4 },
});
