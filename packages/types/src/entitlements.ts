import type { SubscriptionTier } from './enums';

/**
 * Feature entitlements.
 *
 * The backend is the authority: every premium route is guarded and every quota
 * is counted server-side. The client reads the same values purely to decide what
 * to show, so the paywall never appears as a surprise (master prompt §35, §36).
 */
export const ENTITLEMENT_KEYS = {
  STORY_MONTHLY_LIMIT: 'story_monthly_limit',
  NARRATION_MONTHLY_LIMIT: 'narration_monthly_limit',
  ILLUSTRATION_MONTHLY_LIMIT: 'illustration_monthly_limit',
  PARENT_VOICE_CLONE: 'parent_voice_clone',
  VOICE_PROFILE_LIMIT: 'voice_profile_limit',
  PREMIUM_SYSTEM_VOICES: 'premium_system_voices',
  HD_BOOK_EXPORT: 'hd_book_export',
  PHYSICAL_BOOK_DISCOUNT_PERCENT: 'physical_book_discount_percent',
} as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[keyof typeof ENTITLEMENT_KEYS];

/** Numeric entitlements are monthly quotas or hard caps; boolean ones are gates. */
export interface EntitlementSet {
  readonly [ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT]: number;
  readonly [ENTITLEMENT_KEYS.NARRATION_MONTHLY_LIMIT]: number;
  readonly [ENTITLEMENT_KEYS.ILLUSTRATION_MONTHLY_LIMIT]: number;
  readonly [ENTITLEMENT_KEYS.PARENT_VOICE_CLONE]: boolean;
  readonly [ENTITLEMENT_KEYS.VOICE_PROFILE_LIMIT]: number;
  readonly [ENTITLEMENT_KEYS.PREMIUM_SYSTEM_VOICES]: boolean;
  readonly [ENTITLEMENT_KEYS.HD_BOOK_EXPORT]: boolean;
  readonly [ENTITLEMENT_KEYS.PHYSICAL_BOOK_DISCOUNT_PERCENT]: number;
}

export const ENTITLEMENTS: Readonly<Record<SubscriptionTier, EntitlementSet>> = {
  FREE: {
    story_monthly_limit: 4,
    narration_monthly_limit: 8,
    illustration_monthly_limit: 6,
    parent_voice_clone: false,
    voice_profile_limit: 0,
    premium_system_voices: false,
    hd_book_export: false,
    physical_book_discount_percent: 0,
  },
  PREMIUM: {
    story_monthly_limit: 100,
    narration_monthly_limit: 200,
    illustration_monthly_limit: 200,
    parent_voice_clone: true,
    voice_profile_limit: 2,
    premium_system_voices: true,
    hd_book_export: true,
    physical_book_discount_percent: 10,
  },
} as const;

/** Quota keys are the subset that is counted per calendar month. */
export const QUOTA_KEYS = [
  ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT,
  ENTITLEMENT_KEYS.NARRATION_MONTHLY_LIMIT,
  ENTITLEMENT_KEYS.ILLUSTRATION_MONTHLY_LIMIT,
] as const;

export type QuotaKey = (typeof QUOTA_KEYS)[number];

/** What `GET /subscription/entitlements` returns, so the UI can render limits honestly. */
export interface EntitlementsResponse {
  tier: SubscriptionTier;
  entitlements: EntitlementSet;
  usage: Record<QuotaKey, { used: number; limit: number; resetsAt: string }>;
}
