import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ANALYTICS_EVENTS, STORY_THEMES } from '@masalim/types';
import { MAX_CUSTOM_PROMPT_LENGTH } from '@masalim/validation';
import { Chip, ChipGroup, Input, Text } from '@masalim/ui';
import { analytics } from '../../src/lib/analytics';
import { useWizard } from '../../src/stores/wizard';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

const MAX_THEMES = 4;

const THEME_EMOJI: Record<string, string> = {
  adventure: '🗺️',
  sleep: '🌙',
  friendship: '🤝',
  courage: '🦁',
  animals: '🐾',
  space: '🚀',
  fairytale: '🏰',
  emotions: '💛',
  educational: '📚',
  fantasy: '🧚',
};

/**
 * Step 3 — what kind of story.
 *
 * Themes are capped at four and further chips stop responding once the cap is
 * reached, with the limit stated. Silently ignoring a tap is how an interface
 * feels broken; silently dropping the earliest choice is how a parent ends up
 * with a story they did not ask for.
 *
 * The free-text box is explicitly optional, because the brief is clear that a
 * parent who has no idea should still get a good story.
 */
export default function CreateThemeStep() {
  const router = useRouter();
  const { t } = useI18n();
  const draft = useWizard((state) => state.draft);
  const update = useWizard((state) => state.update);
  const toggleTheme = useWizard((state) => state.toggleTheme);

  const atLimit = draft.themes.length >= MAX_THEMES;

  return (
    <WizardStep
      step={3}
      title={t('storyCreate.step3Title')}
      subtitle={t('storyCreate.step3Subtitle')}
      canContinue={draft.themes.length > 0}
      onContinue={() => {
        analytics.capture(ANALYTICS_EVENTS.STORY_CREATION_STEP_COMPLETED, {
          step: 'theme',
          step_index: 3,
          theme_count: draft.themes.length,
          // Whether the free-text box was used, never what was written in it —
          // and not named `custom_prompt_used`, which redaction would strip.
          used_custom_idea: draft.customPrompt.trim().length > 0,
        });
        router.push('/create/settings');
      }}
    >
      <ChipGroup>
        {STORY_THEMES.map((theme) => {
          const selected = draft.themes.includes(theme);
          return (
            <Chip
              key={theme}
              label={t(`themes.${theme}`)}
              emoji={THEME_EMOJI[theme] ?? '✨'}
              selected={selected}
              disabled={!selected && atLimit}
              onPress={() => {
                toggleTheme(theme, MAX_THEMES);
              }}
            />
          );
        })}
      </ChipGroup>

      {atLimit ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('storyCreate.themesLimit', { count: MAX_THEMES })}
        </Text>
      ) : null}

      <View style={styles.idea}>
        <Input
          label={t('storyCreate.ideaLabel')}
          placeholder={t('storyCreate.ideaPlaceholder')}
          hint={t('storyCreate.ideaHint')}
          value={draft.customPrompt}
          onChangeText={(value) => {
            update({ customPrompt: value });
          }}
          multiline
          maxLength={MAX_CUSTOM_PROMPT_LENGTH}
          showCounter
        />
      </View>
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  idea: { marginTop: 20 },
});
