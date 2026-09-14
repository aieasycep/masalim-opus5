/**
 * Feature flags for controlled production rollout (master prompt §87).
 * Defaults apply when the database has no row for a key yet.
 */
export const FEATURE_FLAGS = {
  PHYSICAL_BOOKS: 'physical_books',
  PARENT_VOICE_CLONING: 'parent_voice_cloning',
  ILLUSTRATIONS: 'illustrations',
  SUBSCRIPTIONS: 'subscriptions',
  STORY_SHARING: 'story_sharing',
  GUEST_MODE: 'guest_mode',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_DEFAULTS: Readonly<Record<FeatureFlagKey, boolean>> = {
  physical_books: true,
  parent_voice_cloning: true,
  illustrations: true,
  subscriptions: true,
  story_sharing: false,
  guest_mode: false,
} as const;
