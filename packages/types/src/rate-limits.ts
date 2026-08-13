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
  auth_attempts: { limit: 5, windowSeconds: 15 * MINUTE },
  upload_hourly: { limit: 120, windowSeconds: HOUR },
  global_per_minute: { limit: 300, windowSeconds: MINUTE },
} as const;
