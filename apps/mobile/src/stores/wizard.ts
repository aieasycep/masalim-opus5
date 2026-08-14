import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AgeRange,
  FantasyLevel,
  HeroType,
  HumourLevel,
  StoryDuration,
  StoryTheme,
} from '@masalim/types';

export interface WizardDraft {
  childId: string | null;
  heroName: string;
  heroType: HeroType;
  themes: StoryTheme[];
  ageRange: AgeRange | null;
  durationTarget: StoryDuration;
  customPrompt: string;
  educationalGoal: string;
  teachNewWords: boolean;
  calmBedtimeEnding: boolean;
  humourLevel: HumourLevel | null;
  fantasyLevel: FantasyLevel | null;
  voiceProfileId: string | null;
  systemVoiceId: string | null;
}

const EMPTY: WizardDraft = {
  childId: null,
  heroName: '',
  heroType: 'CHILD',
  themes: [],
  ageRange: null,
  durationTarget: 'MEDIUM',
  customPrompt: '',
  educationalGoal: '',
  teachNewWords: false,
  calmBedtimeEnding: true,
  humourLevel: null,
  fantasyLevel: null,
  voiceProfileId: null,
  systemVoiceId: null,
};

interface WizardState {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  toggleTheme: (theme: StoryTheme, max: number) => void;
  reset: () => void;
  /** True once the parent has entered enough to be worth restoring. */
  hasProgress: () => boolean;
}

/**
 * The story wizard's in-progress answers.
 *
 * Persisted to disk on every change. Six steps is a long way to get through on
 * a phone at bedtime, and losing it to a backgrounded app, an incoming call or a
 * provider error would mean starting over — which is precisely the failure the
 * brief calls out (§14, §58). Restoring is offered rather than forced: the
 * wizard asks whether to continue.
 */
export const useWizard = create<WizardState>()(
  persist(
    (set, get) => ({
      draft: EMPTY,

      update: (patch) => {
        set((state) => ({ draft: { ...state.draft, ...patch } }));
      },

      toggleTheme: (theme, max) => {
        set((state) => {
          const themes = state.draft.themes.includes(theme)
            ? state.draft.themes.filter((candidate) => candidate !== theme)
            : // Silently dropping the oldest would be confusing; the screen
              // disables further selection at the limit instead.
              state.draft.themes.length >= max
              ? state.draft.themes
              : [...state.draft.themes, theme];
          return { draft: { ...state.draft, themes } };
        });
      },

      reset: () => {
        set({ draft: EMPTY });
      },

      hasProgress: () => {
        const { draft } = get();
        return (
          draft.heroName.trim().length > 0 ||
          draft.themes.length > 0 ||
          draft.customPrompt.trim().length > 0
        );
      },
    }),
    {
      name: 'masalim.wizard-draft',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the answers are persisted; the actions are rebuilt on load.
      partialize: (state) => ({ draft: state.draft }),
    },
  ),
);
