import type { AgeRange, FantasyLevel, HumourLevel, StoryDuration } from './enums';

/**
 * Age-appropriateness rules.
 *
 * These are not decoration: the prompt builder feeds every field into the model
 * and the response validator enforces the page/word bounds, so a child's age
 * genuinely changes vocabulary, sentence length, plot and fear level (§16).
 */
export interface AgeBandRules {
  readonly ageRange: AgeRange;
  /** Human label used in UI and in the prompt ("3–5 yaş"). */
  readonly label: string;
  readonly minAge: number;
  readonly maxAge: number;
  readonly pages: { min: number; max: number };
  readonly wordsPerPage: { min: number; max: number };
  readonly maxSentenceWords: number;
  /** Free-text guidance injected verbatim into the system prompt. */
  readonly vocabularyGuidance: string;
  readonly narrativeGuidance: string;
  /** 0 = no peril at all, 3 = mild suspense that resolves well before the end. */
  readonly maxTensionLevel: 0 | 1 | 2 | 3;
}

export const AGE_BAND_RULES: Readonly<Record<AgeRange, AgeBandRules>> = {
  AGE_0_2: {
    ageRange: 'AGE_0_2',
    label: '0–2',
    minAge: 0,
    maxAge: 2,
    pages: { min: 4, max: 6 },
    wordsPerPage: { min: 15, max: 25 },
    maxSentenceWords: 8,
    vocabularyGuidance:
      'Yalnızca somut, günlük kelimeler kullan. Tekrar eden kalıplar ve ses taklitleri kullan. Soyut kavram kullanma.',
    narrativeGuidance:
      'Olay örgüsü tek bir basit eylemden oluşsun. Çatışma, sürpriz veya kayıp olmasın. Sıcak ve sakin bitir.',
    maxTensionLevel: 0,
  },
  AGE_3_5: {
    ageRange: 'AGE_3_5',
    label: '3–5',
    minAge: 3,
    maxAge: 5,
    pages: { min: 8, max: 10 },
    wordsPerPage: { min: 30, max: 50 },
    maxSentenceWords: 12,
    vocabularyGuidance:
      'Basit ve tanıdık kelimeler kullan. Kısa cümleler kur. Nadiren yeni bir kelime tanıt ve hemen bağlamla açıkla.',
    narrativeGuidance:
      'Küçük bir sorun ortaya çıksın ve nazikçe çözülsün. Korkutucu unsur kullanma. Kahraman yalnız kalmasın.',
    maxTensionLevel: 1,
  },
  AGE_6_8: {
    ageRange: 'AGE_6_8',
    label: '6–8',
    minAge: 6,
    maxAge: 8,
    pages: { min: 10, max: 14 },
    wordsPerPage: { min: 60, max: 90 },
    maxSentenceWords: 18,
    vocabularyGuidance:
      'Daha zengin kelime dağarcığı kullanabilirsin. Birkaç yeni kelimeyi doğal bağlam içinde öğret.',
    narrativeGuidance:
      'Net bir macera yayı kur: hedef, engel, çözüm. Hafif heyecan olabilir ancak tehlike gerçekçi ve ürkütücü olmasın.',
    maxTensionLevel: 2,
  },
  AGE_9_12: {
    ageRange: 'AGE_9_12',
    label: '9–12',
    minAge: 9,
    maxAge: 12,
    pages: { min: 14, max: 20 },
    wordsPerPage: { min: 90, max: 130 },
    maxSentenceWords: 24,
    vocabularyGuidance:
      'Yaşına uygun edebi bir dil kullanabilirsin. Betimlemeler ve mecazlar serbest.',
    narrativeGuidance:
      'Yan olay örgüsü ve karakter gelişimi ekleyebilirsin. Hafif gerilim kurabilirsin ancak sonda mutlaka güvenli ve umutlu bir çözüm olsun.',
    maxTensionLevel: 3,
  },
} as const;

/**
 * Duration targets.
 *
 * Turkish bedtime narration runs at roughly 145 words per minute, which is how
 * the word budget below maps onto the "≈3 / ≈6 / ≈10 dakika" labels in the UI.
 */
export const TURKISH_NARRATION_WORDS_PER_MINUTE = 145;

export interface DurationRules {
  readonly duration: StoryDuration;
  readonly approxMinutes: number;
  readonly targetWords: number;
  readonly wordTolerance: number;
}

export const DURATION_RULES: Readonly<Record<StoryDuration, DurationRules>> = {
  SHORT: { duration: 'SHORT', approxMinutes: 3, targetWords: 435, wordTolerance: 120 },
  MEDIUM: { duration: 'MEDIUM', approxMinutes: 6, targetWords: 870, wordTolerance: 200 },
  LONG: { duration: 'LONG', approxMinutes: 10, targetWords: 1450, wordTolerance: 300 },
} as const;

/**
 * Resolve how many pages a story should have for a given age band and duration.
 * Longer stories push toward the top of the band's page range rather than making
 * individual pages unreadably dense.
 */
export function resolvePageCount(ageRange: AgeRange, duration: StoryDuration): number {
  const band = AGE_BAND_RULES[ageRange];
  const target = DURATION_RULES[duration].targetWords;
  const midWordsPerPage = (band.wordsPerPage.min + band.wordsPerPage.max) / 2;
  const ideal = Math.round(target / midWordsPerPage);
  return Math.min(band.pages.max, Math.max(band.pages.min, ideal));
}

/** Derive the age band from a child's birth date, for auto-filling the wizard. */
export function ageRangeFromAge(ageInYears: number): AgeRange {
  if (ageInYears <= 2) return 'AGE_0_2';
  if (ageInYears <= 5) return 'AGE_3_5';
  if (ageInYears <= 8) return 'AGE_6_8';
  return 'AGE_9_12';
}

/** Optional advanced settings from the wizard's "Gelişmiş ayarlar" accordion. */
export interface StoryAdvancedSettings {
  readonly educationalGoal?: string;
  readonly teachNewWords?: boolean;
  readonly calmBedtimeEnding?: boolean;
  readonly humourLevel?: HumourLevel;
  readonly fantasyLevel?: FantasyLevel;
}
