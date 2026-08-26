import { FEATURE_FLAGS } from '@masalim/types';
import type { FeatureFlagKey } from '@masalim/types';

/**
 * What each switch actually governs, in the operator's language.
 *
 * The key is the server's identifier and is always shown as-is next to the
 * label: a flag is discussed in code reviews and incident channels by its key,
 * so a Turkish name that replaced it would make the console harder to talk
 * about, not easier.
 *
 * The copy describes the surface the flag controls and stops there. What the
 * app does behind that surface — whether an in-flight order survives the switch
 * being turned off, how a rollout percentage is bucketed — belongs to the code
 * that reads the flag, and guessing at it here would put a sentence on screen
 * that nobody verified.
 */

interface FlagCopy {
  label: string;
  summary: string;
}

const FLAG_COPY: Readonly<Record<FeatureFlagKey, FlagCopy>> = {
  [FEATURE_FLAGS.PHYSICAL_BOOKS]: {
    label: 'Basılı kitap siparişi',
    summary: 'Ailelerin masallarını basılı kitap olarak sipariş edebildiği akışı yönetir.',
  },
  [FEATURE_FLAGS.PARENT_VOICE_CLONING]: {
    label: 'Ebeveyn sesiyle seslendirme',
    summary: 'Ebeveynin kendi sesini kaydedip masalları o sesle dinletmesini yönetir.',
  },
  [FEATURE_FLAGS.ILLUSTRATIONS]: {
    label: 'Masal görselleri',
    summary: 'Masallara görsel üretilmesini yönetir.',
  },
  [FEATURE_FLAGS.SUBSCRIPTIONS]: {
    label: 'Abonelikler',
    summary: 'Uygulamadaki abonelik satın alma ve yükseltme akışını yönetir.',
  },
  [FEATURE_FLAGS.STORY_SHARING]: {
    label: 'Masal paylaşımı',
    summary: 'Bir masalın aile dışına paylaşılabilmesini yönetir.',
  },
  [FEATURE_FLAGS.GUEST_MODE]: {
    label: 'Misafir kullanım',
    summary: 'Hesap açmadan uygulamayı denemeyi yönetir.',
  },
};

/**
 * A flag's human name.
 *
 * A key the console has no copy for still gets a readable label rather than
 * being hidden: the API lists every flag it knows about, and one added upstream
 * this morning is exactly the flag an operator most needs to see tonight.
 */
export function flagLabel(key: string): string {
  const copy = FLAG_COPY[key as FeatureFlagKey];
  if (copy) return copy.label;
  return key.replace(/_/g, ' ');
}

/** The console's own description, used only when the server has none. */
export function flagSummary(key: string): string | null {
  return FLAG_COPY[key as FeatureFlagKey]?.summary ?? null;
}

/** True for a key this build of the console recognises. */
export function isKnownFlag(key: string): boolean {
  return key in FLAG_COPY;
}

/**
 * The sentence the confirmation step has to say out loud.
 *
 * It names the flag and states the direction, because "Emin misiniz?" over a
 * switch that changes the product for every family at once is not a question
 * anyone can answer.
 */
export function flagChangeSentence(
  key: string,
  enabled: boolean,
  rolloutPercentage: number,
): string {
  const name = `“${flagLabel(key)}” (${key})`;
  if (!enabled) {
    return `${name} bayrağı kapatılacak. Bu özellik hizmeti kullanan tüm ailelerde kapanır.`;
  }
  if (rolloutPercentage >= 100) {
    return `${name} bayrağı açılacak. Bu özellik hizmeti kullanan tüm ailelere açılır.`;
  }
  return `${name} bayrağı açılacak ve kademe yüzde ${rolloutPercentage} olarak kaydedilecek. Özellik ailelerin tamamına değil, bu orana denk gelen kısmına uygulanır.`;
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

export function formatPercentage(value: number): string {
  return `%${new Intl.NumberFormat('tr-TR').format(value)}`;
}
