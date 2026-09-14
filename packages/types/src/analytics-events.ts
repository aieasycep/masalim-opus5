/**
 * Central analytics event registry (master prompt §49).
 *
 * Names live here so they cannot drift between mobile and backend, and so a
 * provider swap (PostHog, Firebase, Mixpanel) never touches call sites.
 *
 * Two limits are worth knowing before trusting a number from this set.
 *
 * **Nothing before sign-in is measurable.** Consent is stored per account and
 * read from the server, so a device with no session has no decision to honour
 * and captures nothing. `ONBOARDING_STARTED` is therefore not emitted by the
 * app at all: on a first run it would be dropped, and the only case where it
 * *would* send is a signed-out relaunch by an existing consenting parent —
 * which counts relaunches, not people starting onboarding. A number that only
 * appears when it is wrong is worse than an absent one. Measuring acquisition
 * would mean asking for analytics consent before a parent has seen the product,
 * which is not a trade this product makes.
 *
 * **Generation outcomes depend on a screen staying open.** `STORY_GENERATED`,
 * `STORY_GENERATION_FAILED`, `STORY_REJECTED_BY_SAFETY` and the illustration
 * equivalents are emitted by the client watching the job settle, so an outcome
 * that lands after the parent leaves the app is never reported. Completion rates
 * from these events are therefore a floor, not a measurement. Emitting them from
 * the worker that finishes the job is the fix, and is why this registry is
 * dependency-free enough to import from the API.
 */
export const ANALYTICS_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  SIGN_UP_COMPLETED: 'sign_up_completed',
  SIGN_IN_COMPLETED: 'sign_in_completed',

  CHILD_CREATED: 'child_created',
  CHILD_UPDATED: 'child_updated',

  STORY_CREATION_STARTED: 'story_creation_started',
  STORY_CREATION_STEP_COMPLETED: 'story_creation_step_completed',
  STORY_GENERATION_REQUESTED: 'story_generation_requested',
  STORY_GENERATED: 'story_generated',
  STORY_GENERATION_FAILED: 'story_generation_failed',
  STORY_REJECTED_BY_SAFETY: 'story_rejected_by_safety',
  STORY_OPENED: 'story_opened',
  STORY_FAVOURITED: 'story_favourited',
  STORY_DELETED: 'story_deleted',

  VOICE_INTRO_VIEWED: 'voice_intro_viewed',
  VOICE_CONSENT_ACCEPTED: 'voice_consent_accepted',
  VOICE_RECORDING_STARTED: 'voice_recording_started',
  VOICE_RECORDING_COMPLETED: 'voice_recording_completed',
  VOICE_RECORDING_REJECTED: 'voice_recording_rejected',
  VOICE_UPLOAD_FAILED: 'voice_upload_failed',
  VOICE_CREATED: 'voice_created',
  VOICE_CREATION_FAILED: 'voice_creation_failed',
  VOICE_DELETED: 'voice_deleted',

  NARRATION_REQUESTED: 'narration_requested',
  NARRATION_CREATED: 'narration_created',
  NARRATION_FAILED: 'narration_failed',
  PLAYBACK_STARTED: 'playback_started',
  PLAYBACK_COMPLETED: 'playback_completed',
  SLEEP_TIMER_SET: 'sleep_timer_set',

  ILLUSTRATION_GENERATION_STARTED: 'illustration_generation_started',
  ILLUSTRATION_GENERATION_COMPLETED: 'illustration_generation_completed',
  ILLUSTRATION_GENERATION_FAILED: 'illustration_generation_failed',
  ILLUSTRATION_REGENERATED: 'illustration_regenerated',

  BOOK_CREATED: 'book_created',
  BOOK_EDITED: 'book_edited',
  BOOK_PREVIEWED: 'book_previewed',

  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_ADDRESS_SUBMITTED: 'checkout_address_submitted',
  PURCHASE_COMPLETED: 'purchase_completed',
  PURCHASE_FAILED: 'purchase_failed',

  PAYWALL_VIEWED: 'paywall_viewed',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Analytics payloads must never carry child names, emails or raw prompts. */
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
