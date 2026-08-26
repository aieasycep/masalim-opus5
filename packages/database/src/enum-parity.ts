import {
  ADMIN_ROLES,
  AGE_RANGES,
  AI_JOB_STATUSES,
  AI_JOB_TYPES,
  ASSET_KINDS,
  ASSET_VISIBILITIES,
  AUTH_PROVIDERS,
  BOOK_PAGE_LAYOUTS,
  BOOK_RENDER_KINDS,
  BOOK_SIZES,
  BOOK_STATUSES,
  COVER_TYPES,
  CURRENCIES,
  DELETION_REQUEST_STATUSES,
  DELETION_REQUEST_TYPES,
  DEVICE_PLATFORMS,
  GENERATION_STATUSES,
  HERO_TYPES,
  ILLUSTRATION_KINDS,
  ILLUSTRATION_STYLES,
  LOCALES,
  MODERATION_STAGES,
  MODERATION_STATUSES,
  NARRATION_STATUSES,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  STORY_DURATIONS,
  STORY_STATUSES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STORES,
  SUBSCRIPTION_TIERS,
  SYSTEM_VOICE_CATEGORIES,
  VOICE_OWNER_TYPES,
  VOICE_PROFILE_STATUSES,
} from '@masalim/types';
import { $Enums } from '@prisma/client';

/**
 * Compile-time parity between the shared domain enums and the Prisma schema.
 *
 * If a value is added to one side and not the other, `assertSameEnum` stops
 * type-checking. That guarantees the database can never hold a value the mobile
 * app and admin panel cannot represent.
 */
type Exact<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : { missingInShared: Exclude<B, A> }
  : { missingInPrisma: Exclude<A, B> };

function assertSameEnum<A extends string, B extends string>(
  _shared: readonly A[],
  _prisma: Record<string, B>,
  ..._proof: Exact<A, B> extends true ? [] : [never]
): void {
  // Purely a type-level assertion; nothing to do at runtime.
}

assertSameEnum(LOCALES, $Enums.Locale);
assertSameEnum(AUTH_PROVIDERS, $Enums.AuthProvider);
assertSameEnum(SUBSCRIPTION_TIERS, $Enums.SubscriptionTier);
assertSameEnum(SUBSCRIPTION_STATUSES, $Enums.SubscriptionStatus);
assertSameEnum(SUBSCRIPTION_STORES, $Enums.SubscriptionStore);
assertSameEnum(AGE_RANGES, $Enums.AgeRange);
assertSameEnum(STORY_DURATIONS, $Enums.StoryDuration);
assertSameEnum(HERO_TYPES, $Enums.HeroType);
assertSameEnum(STORY_STATUSES, $Enums.StoryStatus);
assertSameEnum(MODERATION_STATUSES, $Enums.ModerationStatus);
assertSameEnum(MODERATION_STAGES, $Enums.ModerationStage);
assertSameEnum(VOICE_OWNER_TYPES, $Enums.VoiceOwnerType);
assertSameEnum(VOICE_PROFILE_STATUSES, $Enums.VoiceProfileStatus);
assertSameEnum(SYSTEM_VOICE_CATEGORIES, $Enums.SystemVoiceCategory);
assertSameEnum(NARRATION_STATUSES, $Enums.NarrationStatus);
assertSameEnum(ILLUSTRATION_STYLES, $Enums.IllustrationStyle);
assertSameEnum(ILLUSTRATION_KINDS, $Enums.IllustrationKind);
assertSameEnum(GENERATION_STATUSES, $Enums.GenerationStatus);
assertSameEnum(BOOK_STATUSES, $Enums.BookStatus);
assertSameEnum(BOOK_PAGE_LAYOUTS, $Enums.BookPageLayout);
assertSameEnum(BOOK_RENDER_KINDS, $Enums.BookRenderKind);
assertSameEnum(BOOK_SIZES, $Enums.BookSize);
assertSameEnum(COVER_TYPES, $Enums.CoverType);
assertSameEnum(ORDER_STATUSES, $Enums.OrderStatus);
assertSameEnum(PAYMENT_STATUSES, $Enums.PaymentStatus);
assertSameEnum(CURRENCIES, $Enums.Currency);
assertSameEnum(AI_JOB_TYPES, $Enums.AIJobType);
assertSameEnum(AI_JOB_STATUSES, $Enums.AIJobStatus);
assertSameEnum(ASSET_KINDS, $Enums.AssetKind);
assertSameEnum(ASSET_VISIBILITIES, $Enums.AssetVisibility);
assertSameEnum(NOTIFICATION_TYPES, $Enums.NotificationType);
assertSameEnum(DEVICE_PLATFORMS, $Enums.DevicePlatform);
assertSameEnum(ADMIN_ROLES, $Enums.AdminRole);
assertSameEnum(DELETION_REQUEST_TYPES, $Enums.DeletionRequestType);
assertSameEnum(DELETION_REQUEST_STATUSES, $Enums.DeletionRequestStatus);

export {};
