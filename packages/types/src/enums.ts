/**
 * Domain enums shared by the API, the mobile app and the admin panel.
 *
 * These are the single source of truth. The Prisma schema mirrors them and a
 * compile-time assertion in `@masalim/database` fails the build if the two ever
 * drift apart, so a value can never exist in the database that the clients
 * cannot represent.
 */

export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'tr';

export const AUTH_PROVIDERS = ['EMAIL', 'APPLE', 'GOOGLE'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const SUBSCRIPTION_TIERS = ['FREE', 'PREMIUM'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  'NONE',
  'TRIALING',
  'ACTIVE',
  'IN_GRACE_PERIOD',
  'PAUSED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STORES = ['APP_STORE', 'PLAY_STORE', 'PROMOTIONAL', 'MOCK'] as const;
export type SubscriptionStore = (typeof SUBSCRIPTION_STORES)[number];

/** Age bands drive vocabulary, sentence length, page count and fear level. */
export const AGE_RANGES = ['AGE_0_2', 'AGE_3_5', 'AGE_6_8', 'AGE_9_12'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const STORY_DURATIONS = ['SHORT', 'MEDIUM', 'LONG'] as const;
export type StoryDuration = (typeof STORY_DURATIONS)[number];

export const HERO_TYPES = ['CHILD', 'ANIMAL', 'FANTASY', 'ROBOT', 'CUSTOM'] as const;
export type HeroType = (typeof HERO_TYPES)[number];

/** Theme slugs match the Figma theme grid exactly (Story Creation, step 3). */
export const STORY_THEMES = [
  'adventure',
  'sleep',
  'friendship',
  'courage',
  'animals',
  'space',
  'fairytale',
  'emotions',
  'educational',
  'fantasy',
] as const;
export type StoryTheme = (typeof STORY_THEMES)[number];

export const STORY_STATUSES = [
  'DRAFT',
  'GENERATING',
  'READY',
  'FAILED',
  'REJECTED',
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const MODERATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_STAGES = ['INPUT', 'OUTPUT'] as const;
export type ModerationStage = (typeof MODERATION_STAGES)[number];

/**
 * MVP surfaces mother and father. The remaining values exist so grandparents and
 * other family members can be enabled later without a migration.
 */
export const VOICE_OWNER_TYPES = [
  'MOTHER',
  'FATHER',
  'GRANDMOTHER',
  'GRANDFATHER',
  'OTHER',
] as const;
export type VoiceOwnerType = (typeof VOICE_OWNER_TYPES)[number];

export const VOICE_PROFILE_STATUSES = [
  'AWAITING_RECORDING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETING',
] as const;
export type VoiceProfileStatus = (typeof VOICE_PROFILE_STATUSES)[number];

export const SYSTEM_VOICE_CATEGORIES = ['CALM', 'CHEERFUL', 'FAIRYTALE', 'ENERGETIC'] as const;
export type SystemVoiceCategory = (typeof SYSTEM_VOICE_CATEGORIES)[number];

export const NARRATION_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type NarrationStatus = (typeof NARRATION_STATUSES)[number];

/** Illustration styles resolve to server-side prompt templates; clients only send the key. */
export const ILLUSTRATION_STYLES = [
  'watercolor',
  'soft3d',
  'classic_storybook',
  'pastel',
  'hand_drawn',
] as const;
export type IllustrationStyle = (typeof ILLUSTRATION_STYLES)[number];

export const ILLUSTRATION_KINDS = ['COVER', 'PAGE', 'BACK_COVER'] as const;
export type IllustrationKind = (typeof ILLUSTRATION_KINDS)[number];

export const GENERATION_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const BOOK_STATUSES = ['DRAFT', 'READY', 'ORDERED'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_PAGE_LAYOUTS = [
  'IMAGE_TOP_TEXT_BOTTOM',
  'IMAGE_FULL_TEXT_OVERLAY',
  'TEXT_ONLY',
  'IMAGE_ONLY',
] as const;
export type BookPageLayout = (typeof BOOK_PAGE_LAYOUTS)[number];

export const BOOK_RENDER_KINDS = ['DIGITAL_PREVIEW', 'PRINT_PDF'] as const;
export type BookRenderKind = (typeof BOOK_RENDER_KINDS)[number];

export const BOOK_SIZES = ['SQUARE', 'STANDARD'] as const;
export type BookSize = (typeof BOOK_SIZES)[number];

export const COVER_TYPES = ['HARDCOVER', 'SOFTCOVER'] as const;
export type CoverType = (typeof COVER_TYPES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'TRY';

/** Every long-running AI operation is tracked centrally through AIJob. */
export const AI_JOB_TYPES = [
  'STORY_GENERATION',
  'VOICE_CLONE',
  'NARRATION_GENERATION',
  'ILLUSTRATION_GENERATION',
  'BOOK_RENDER',
  'PRINT_FILE_GENERATION',
] as const;
export type AIJobType = (typeof AI_JOB_TYPES)[number];

export const AI_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AIJobStatus = (typeof AI_JOB_STATUSES)[number];

export const ASSET_KINDS = [
  'VOICE_RECORDING',
  'VOICE_PREVIEW',
  'NARRATION_AUDIO',
  'ILLUSTRATION',
  'BOOK_PREVIEW',
  'PRINT_PDF',
  'CHILD_AVATAR',
  'USER_AVATAR',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_VISIBILITIES = ['PRIVATE', 'PUBLIC'] as const;
export type AssetVisibility = (typeof ASSET_VISIBILITIES)[number];

export const NOTIFICATION_TYPES = [
  'STORY_READY',
  'STORY_FAILED',
  'VOICE_READY',
  'VOICE_FAILED',
  'ILLUSTRATIONS_READY',
  'BOOK_READY',
  'ORDER_CONFIRMED',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_EXPIRED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEVICE_PLATFORMS = ['IOS', 'ANDROID'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const ADMIN_ROLES = ['ADMIN', 'SUPPORT', 'OPERATIONS'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ACTOR_TYPES = ['USER', 'ADMIN', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const DELETION_REQUEST_TYPES = ['ACCOUNT', 'VOICE_PROFILE'] as const;
export type DeletionRequestType = (typeof DELETION_REQUEST_TYPES)[number];

export const DELETION_REQUEST_STATUSES = [
  'SCHEDULED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export const HUMOUR_LEVELS = ['NONE', 'LIGHT', 'PLAYFUL'] as const;
export type HumourLevel = (typeof HUMOUR_LEVELS)[number];

export const FANTASY_LEVELS = ['GROUNDED', 'BALANCED', 'MAGICAL'] as const;
export type FantasyLevel = (typeof FANTASY_LEVELS)[number];
