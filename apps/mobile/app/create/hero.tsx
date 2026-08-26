import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ANALYTICS_EVENTS, HERO_TYPES, type HeroType } from '@masalim/types';
import { Chip, ChipGroup, Input, OptionCard, Text } from '@masalim/ui';
import { analytics } from '../../src/lib/analytics';
import { useChildren } from '../../src/hooks/queries';
import { useWizard } from '../../src/stores/wizard';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

const HERO_TYPE_KEYS: Record<HeroType, string> = {
  CHILD: 'storyCreate.heroTypeChild',
  ANIMAL: 'storyCreate.heroTypeAnimal',
  FANTASY: 'storyCreate.heroTypeFantasy',
  ROBOT: 'storyCreate.heroTypeRobot',
  CUSTOM: 'storyCreate.heroTypeCustom',
};

/**
 * Step 2 — the hero.
 *
 * Making the child the hero is the fastest path and the one most parents take,
 * so it is offered as a single tap with their name already filled in. Choosing
 * someone else reveals the name field rather than showing an empty box first.
 */
export default function CreateHeroStep() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: children = [] } = useChildren();
  const draft = useWizard((state) => state.draft);
  const update = useWizard((state) => state.update);

  const child = children.find((candidate) => candidate.id === draft.childId) ?? null;
  const heroIsChild = child !== null && draft.heroName === child.name;
  const canContinue = draft.heroName.trim().length > 0;

  return (
    <WizardStep
      step={2}
      title={t('storyCreate.step2Title')}
      {...(child ? { subtitle: t('storyCreate.step2Subtitle', { name: child.name }) } : {})}
      canContinue={canContinue}
      onContinue={() => {
        analytics.capture(ANALYTICS_EVENTS.STORY_CREATION_STEP_COMPLETED, {
          step: 'hero',
          step_index: 2,
          hero_type: draft.heroType,
          hero_is_child: heroIsChild,
        });
        router.push('/create/theme');
      }}
    >
      {child ? (
        <OptionCard
          title={t('storyCreate.heroIsChild', { name: child.name })}
          description={t('storyCreate.heroIsChildSub', { name: child.name })}
          emoji="🧒"
          selected={heroIsChild}
          onPress={() => {
            update({ heroName: child.name, heroType: 'CHILD' });
          }}
        />
      ) : null}

      <OptionCard
        title={t('storyCreate.heroIsCustom')}
        description={t('storyCreate.heroIsCustomSub')}
        emoji="✨"
        selected={!heroIsChild}
        onPress={() => {
          if (heroIsChild) update({ heroName: '' });
        }}
      />

      {!heroIsChild ? (
        <View style={styles.custom}>
          <Input
            label={t('storyCreate.heroNameLabel')}
            placeholder={t('storyCreate.heroNamePlaceholder')}
            value={draft.heroName}
            onChangeText={(value) => {
              update({ heroName: value });
            }}
            autoCapitalize="words"
            maxLength={40}
          />

          <Text variant="smallBold" tone="muted" style={styles.typeLabel}>
            {t('storyCreate.heroTypeLabel')}
          </Text>
          <ChipGroup>
            {HERO_TYPES.map((type) => (
              <Chip
                key={type}
                label={t(HERO_TYPE_KEYS[type])}
                selected={draft.heroType === type}
                onPress={() => {
                  update({ heroType: type });
                }}
              />
            ))}
          </ChipGroup>
        </View>
      ) : null}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  custom: { marginTop: 8, gap: 4 },
  typeLabel: { marginTop: 12, marginBottom: 8 },
});
