import type { Money, StorySummaryDto } from '@masalim/types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The subtitle under a story's title.
 *
 * Assembled from whatever is actually true — child, duration, narrator — rather
 * than a fixed template with blanks, so a story with no narration yet does not
 * read "Ege · · ".
 */
export function storyMeta(story: StorySummaryDto, t: Translate): string {
  const parts: string[] = [];

  if (story.childName) parts.push(story.childName);
  if (story.durationSeconds !== null) {
    parts.push(t('common.minutes', { count: Math.max(1, Math.round(story.durationSeconds / 60)) }));
  }
  if (story.narratorLabel) parts.push(story.narratorLabel);

  return parts.join(' · ');
}

/** `mm:ss`, which is how a player position is read. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes)}:${String(remainder).padStart(2, '0')}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

/**
 * Money, as a Turkish reader expects it: `₺499,00`.
 *
 * The amount arrives as a decimal string and is reformatted, never parsed into a
 * float — the whole point of transporting it as a string is that nothing on the
 * way to the screen rounds it.
 */
export function formatMoney(money: Money): string {
  const symbol = CURRENCY_SYMBOLS[money.currency] ?? money.currency;
  const [whole = '0', fraction = '00'] = money.amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${symbol}${grouped},${fraction.padEnd(2, '0')}`;
}

/** A short, relative-feeling date: "14 Ağustos". */
export function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
  });
}
