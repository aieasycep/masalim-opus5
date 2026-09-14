import type {
  DeletionRequestStatus,
  DeletionRequestType,
  Locale,
  SubscriptionStatus,
  SubscriptionTier,
} from '@masalim/types';
import type { BadgeTone } from '../../../src/components/ui';

/**
 * Shared vocabulary for the account lookup.
 *
 * Every label translates a value the server owns and falls back to the raw key,
 * so a status added upstream tomorrow still shows up instead of leaving a blank
 * cell behind. Nothing here derives a state the API did not send: whether an
 * account is deleted, whether a deletion is still pending, and when it is due
 * are all read straight off the DTO.
 */

const SUBSCRIPTION_TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Ücretsiz',
  PREMIUM: 'Premium',
};

export function subscriptionTierLabel(tier: SubscriptionTier): string {
  return SUBSCRIPTION_TIER_LABELS[tier] ?? tier;
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  NONE: 'Abonelik yok',
  TRIALING: 'Deneme sürümünde',
  ACTIVE: 'Etkin',
  IN_GRACE_PERIOD: 'Ödeme bekleniyor',
  PAUSED: 'Duraklatıldı',
  EXPIRED: 'Süresi doldu',
  CANCELLED: 'İptal edildi',
};

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

export function subscriptionStatusTone(status: SubscriptionStatus): BadgeTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIALING') return 'primary';
  if (status === 'IN_GRACE_PERIOD' || status === 'PAUSED') return 'warning';
  if (status === 'EXPIRED' || status === 'CANCELLED') return 'danger';
  return 'neutral';
}

const LOCALE_LABELS: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
};

export function localeLabel(locale: Locale): string {
  return LOCALE_LABELS[locale] ?? locale;
}

const DELETION_TYPE_LABELS: Record<DeletionRequestType, string> = {
  ACCOUNT: 'Hesabın tamamı',
  VOICE_PROFILE: 'Ses kaydı',
};

export function deletionTypeLabel(type: DeletionRequestType): string {
  return DELETION_TYPE_LABELS[type] ?? type;
}

const DELETION_STATUS_LABELS: Record<DeletionRequestStatus, string> = {
  SCHEDULED: 'Planlandı',
  PROCESSING: 'Siliniyor',
  COMPLETED: 'Silindi',
  FAILED: 'Başarısız',
  CANCELLED: 'Vazgeçildi',
};

export function deletionStatusLabel(status: DeletionRequestStatus): string {
  return DELETION_STATUS_LABELS[status] ?? status;
}

export function deletionStatusTone(status: DeletionRequestStatus): BadgeTone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'PROCESSING') return 'primary';
  if (status === 'SCHEDULED') return 'warning';
  return 'neutral';
}

/** SCHEDULED and PROCESSING are the two states the API itself counts as open. */
export function isOpenDeletion(status: DeletionRequestStatus): boolean {
  return status === 'SCHEDULED' || status === 'PROCESSING';
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

const DATE_FORMAT = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return DATE_TIME_FORMAT.format(value);
}

export function formatDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return DATE_FORMAT.format(value);
}

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

function formatSpan(totalMinutes: number): string {
  if (totalMinutes < HOUR_MINUTES) return `${totalMinutes} dakika`;

  const hours = Math.floor(totalMinutes / HOUR_MINUTES);
  if (hours < DAY_HOURS) {
    const restMinutes = totalMinutes % HOUR_MINUTES;
    return restMinutes > 0 ? `${hours} saat ${restMinutes} dk` : `${hours} saat`;
  }

  const days = Math.floor(hours / DAY_HOURS);
  const restHours = hours % DAY_HOURS;
  return restHours > 0 ? `${days} gün ${restHours} saat` : `${days} gün`;
}

/**
 * How far a moment is from now, said the way support would say it on the phone.
 *
 * A deletion that is still in the future is the answer to "when will my data be
 * gone"; one whose date has passed while the request is still open is the
 * answer to a harder question, so the two never render the same.
 */
export function formatWhen(iso: string, nowMs: number): string {
  const moment = new Date(iso).getTime();
  if (Number.isNaN(moment)) return '—';

  const differenceMinutes = Math.round((moment - nowMs) / MINUTE_MS);
  if (differenceMinutes === 0) return 'şu an';
  if (differenceMinutes > 0) return `${formatSpan(differenceMinutes)} sonra`;
  return `${formatSpan(-differenceMinutes)} önce`;
}

export function isPast(iso: string, nowMs: number): boolean {
  const moment = new Date(iso).getTime();
  if (Number.isNaN(moment)) return false;
  return moment <= nowMs;
}
