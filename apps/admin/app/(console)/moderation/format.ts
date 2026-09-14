import type { AgeRange, Locale, ModerationStage, ModerationStatus } from '@masalim/types';
import type { BadgeTone } from '../../../src/components/ui';

/**
 * Shared vocabulary for the moderation queue.
 *
 * Every label here is a translation of a value the server owns, never a
 * substitute for one: each lookup falls back to the raw key, so a category the
 * provider starts returning tomorrow still shows up in the table instead of
 * disappearing behind an empty cell.
 */

/** Turkish names for the provider's category keys (OpenAI slashes, mock underscores). */
const CATEGORY_LABELS: Record<string, string> = {
  violence: 'Şiddet',
  'violence/graphic': 'Şiddet (grafik)',
  self_harm: 'Kendine zarar',
  'self-harm': 'Kendine zarar',
  'self-harm/intent': 'Kendine zarar (niyet)',
  'self-harm/instructions': 'Kendine zarar (yönerge)',
  sexual: 'Cinsellik',
  'sexual/minors': 'Cinsellik (çocuk)',
  harassment: 'Taciz',
  'harassment/threatening': 'Taciz (tehdit)',
  hate: 'Nefret',
  'hate/threatening': 'Nefret (tehdit)',
  illicit: 'Yasa dışı',
  'illicit/violent': 'Yasa dışı (şiddet)',
  drugs: 'Uyuşturucu',
  weapons: 'Silah',
  age_inappropriate: 'Yaşa uygun değil',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  AGE_0_2: '0-2 yaş',
  AGE_3_5: '3-5 yaş',
  AGE_6_8: '6-8 yaş',
  AGE_9_12: '9-12 yaş',
};

export function ageRangeLabel(ageRange: AgeRange | null): string {
  if (!ageRange) return 'Yaş aralığı belirtilmemiş';
  return AGE_RANGE_LABELS[ageRange] ?? ageRange;
}

const LOCALE_LABELS: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
};

export function localeLabel(locale: Locale | null): string {
  if (!locale) return 'Dil belirtilmemiş';
  return LOCALE_LABELS[locale] ?? locale;
}

/** INPUT is the idea the parent typed; OUTPUT is the story the model wrote back. */
const STAGE_LABELS: Record<ModerationStage, string> = {
  INPUT: 'Girdi denetimi',
  OUTPUT: 'Çıktı denetimi',
};

export function stageLabel(stage: ModerationStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  story: 'Masal metni',
  prompt: 'Ebeveynin fikri',
};

export function subjectTypeLabel(subjectType: string): string {
  return SUBJECT_TYPE_LABELS[subjectType] ?? subjectType;
}

const VERDICT_LABELS: Record<ModerationStatus, string> = {
  PENDING: 'Beklemede',
  APPROVED: 'Uygun bulundu',
  REJECTED: 'Reddedildi',
  FLAGGED: 'Şüpheli bulundu',
};

export function verdictLabel(verdict: ModerationStatus): string {
  return VERDICT_LABELS[verdict] ?? verdict;
}

export function verdictTone(verdict: ModerationStatus): BadgeTone {
  if (verdict === 'APPROVED') return 'success';
  if (verdict === 'REJECTED') return 'danger';
  if (verdict === 'FLAGGED') return 'warning';
  return 'neutral';
}

/** The queue keeps FLAGGED open for a future classifier that expresses doubt. */
export const QUEUE_VERDICT_FILTERS = ['REJECTED', 'FLAGGED'] as const;
export type QueueVerdictFilter = (typeof QUEUE_VERDICT_FILTERS)[number];

export const QUEUE_SUBJECT_FILTERS = ['story', 'prompt'] as const;
export type QueueSubjectFilter = (typeof QUEUE_SUBJECT_FILTERS)[number];

export function asVerdictFilter(value: string | undefined): QueueVerdictFilter | undefined {
  return QUEUE_VERDICT_FILTERS.find((verdict) => verdict === value);
}

export function asSubjectFilter(value: string | undefined): QueueSubjectFilter | undefined {
  return QUEUE_SUBJECT_FILTERS.find((subject) => subject === value);
}

/** Reads the first value of a search param that Next may hand over as an array. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return DATE_TIME_FORMAT.format(value);
}

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

/** How long this record has been sitting unreviewed, in plain Turkish. */
export function formatWaiting(iso: string, nowMs: number): string {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return '—';

  const minutes = Math.max(0, Math.floor((nowMs - started) / MINUTE_MS));
  if (minutes < HOUR_MINUTES) return `${minutes} dakika`;

  const hours = Math.floor(minutes / HOUR_MINUTES);
  if (hours < DAY_HOURS) {
    const restMinutes = minutes % HOUR_MINUTES;
    return restMinutes > 0 ? `${hours} saat ${restMinutes} dk` : `${hours} saat`;
  }

  const days = Math.floor(hours / DAY_HOURS);
  const restHours = hours % DAY_HOURS;
  return restHours > 0 ? `${days} gün ${restHours} saat` : `${days} gün`;
}

/**
 * A day is the threshold worth marking.
 *
 * The refusal happened at bedtime; once a full day has passed the family has
 * missed another night with no way to appeal it themselves. That is a display
 * cue for triage, not a service promise.
 */
export function isOverdue(iso: string, nowMs: number): boolean {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return false;
  return nowMs - started >= DAY_HOURS * HOUR_MINUTES * MINUTE_MS;
}

/** Provider scores are 0–1 probabilities; shown to three digits, unrounded to a percent. */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—';
  return score.toLocaleString('tr-TR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function scoreBarWidth(score: number): string {
  if (!Number.isFinite(score)) return '0%';
  return `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`;
}
