/**
 * Abuse protection (master prompt §86).
 *
 * A user must not be able to script hundreds of generations. Limits are applied
 * per authenticated user; auth limits additionally key on IP.
 */
export interface RateLimitRule {
  /** Maximum number of successful requests inside the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export const RATE_LIMIT_KEYS = {
  STORY_GENERATION_HOURLY: 'story_generation_hourly',
  STORY_GENERATION_DAILY: 'story_generation_daily',
  ILLUSTRATION_HOURLY: 'illustration_hourly',
  NARRATION_HOURLY: 'narration_hourly',
  VOICE_CLONE_DAILY: 'voice_clone_daily',
  VOICE_CLONE_WEEKLY: 'voice_clone_weekly',
  AUTH_ATTEMPTS: 'auth_attempts',
  AUTH_SIGNUP: 'auth_signup',
  UPLOAD_HOURLY: 'upload_hourly',
  GLOBAL_PER_MINUTE: 'global_per_minute',
} as const;

export type RateLimitKey = (typeof RATE_LIMIT_KEYS)[keyof typeof RATE_LIMIT_KEYS];

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMITS: Readonly<Record<RateLimitKey, RateLimitRule>> = {
  story_generation_hourly: { limit: 10, windowSeconds: HOUR },
  story_generation_daily: { limit: 30, windowSeconds: DAY },
  illustration_hourly: { limit: 60, windowSeconds: HOUR },
  narration_hourly: { limit: 20, windowSeconds: HOUR },
  voice_clone_daily: { limit: 3, windowSeconds: DAY },
  voice_clone_weekly: { limit: 5, windowSeconds: 7 * DAY },

  /**
   * Failed sign-in attempts, keyed on IP *and* email together, so one attacker
   * cannot lock a whole network out of their accounts.
   */
  auth_attempts: { limit: 5, windowSeconds: 15 * MINUTE },

  /**
   * Sign-ups, keyed on IP alone — there is no account to key on yet.
   *
   * Deliberately far looser than the sign-in limit: Turkish mobile carriers put
   * large numbers of subscribers behind carrier-grade NAT, so a handful of
   * families can legitimately share one address. This is set to stop bulk
   * account creation, not to police a household.
   */
  auth_signup: { limit: 20, windowSeconds: HOUR },

  upload_hourly: { limit: 120, windowSeconds: HOUR },
  global_per_minute: { limit: 300, windowSeconds: MINUTE },
} as const;
