import type {
  AgeRange,
  AIJobStatus,
  AIJobType,
  AssetKind,
  BookPageLayout,
  BookRenderKind,
  BookSize,
  BookStatus,
  CoverType,
  Currency,
  DeletionRequestStatus,
  DeletionRequestType,
  GenerationStatus,
  HeroType,
  IllustrationKind,
  IllustrationStyle,
  Locale,
  ModerationStatus,
  NarrationStatus,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  StoryDuration,
  StoryStatus,
  StoryTheme,
  SubscriptionStatus,
  SubscriptionTier,
  SystemVoiceCategory,
  VoiceOwnerType,
  VoiceProfileStatus,
} from './enums';
import type { StoryAdvancedSettings } from './story-rules';
import type { FeatureFlagKey } from './feature-flags';

/** Every timestamp crossing the API boundary is an ISO-8601 string. */
export type IsoDateTime = string;
/** Calendar date without a time component, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Money is transported as a decimal string so no precision is lost in JSON. */
export type MoneyAmount = string;

export interface Money {
  amount: MoneyAmount;
  currency: Currency;
}

export interface Paginated<T> {
  items: T[];
  /** Opaque cursor for the next page; absent when the list is exhausted. */
  nextCursor?: string;
  total?: number;
}

// ---------------------------------------------------------------- User

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  locale: Locale;
  timezone: string;
  onboardingCompleted: boolean;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  createdAt: IsoDateTime;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds, so the client can refresh proactively. */
  expiresIn: number;
}

export interface AuthSession {
  user: UserDto;
  tokens: AuthTokens;
}

// ---------------------------------------------------------------- Child

export interface InterestDto {
  id: string;
  slug: string;
  /** Localisation key; the client renders the translated label. */
  labelKey: string;
  emoji: string;
}

export interface ChildDto {
  id: string;
  name: string;
  birthDate: IsoDate | null;
  ageRange: AgeRange;
  /** Computed from birthDate when available, otherwise the band midpoint. */
  ageInYears: number | null;
  avatarUrl: string | null;
  interests: InterestDto[];
  customInterests: string[];
  storyCount: number;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------- Voice

export interface VoiceProfileDto {
  id: string;
  ownerType: VoiceOwnerType;
  displayName: string;
  status: VoiceProfileStatus;
  /** Signed, short-lived URL. Absent until the preview has been synthesised. */
  previewUrl: string | null;
  consentAcceptedAt: IsoDateTime | null;
  /** Present only when status is FAILED; already mapped to a friendly code. */
  errorCode: string | null;
  createdAt: IsoDateTime;
}

export interface SystemVoiceDto {
  id: string;
  slug: string;
  displayName: string;
  descriptionKey: string;
  category: SystemVoiceCategory;
  previewUrl: string | null;
  premiumOnly: boolean;
}

/** The union the voice picker renders; provider IDs never appear here (§25). */
export type NarratorOption =
  | { kind: 'PARENT'; voice: VoiceProfileDto }
  | { kind: 'SYSTEM'; voice: SystemVoiceDto };

// ---------------------------------------------------------------- Story

export interface StoryPageDto {
  id: string;
  pageNumber: number;
  text: string;
  illustrationUrl: string | null;
}

export interface NarrationDto {
  id: string;
  storyId: string;
  status: NarrationStatus;
  /** Signed URL to the concatenated audio; absent until READY. */
  audioUrl: string | null;
  durationSeconds: number | null;
  narratorLabel: string;
  voiceProfileId: string | null;
  systemVoiceId: string | null;
  createdAt: IsoDateTime;
}

/** Sentence-level offsets that drive text highlighting during playback. */
export interface NarrationSegment {
  pageNumber: number;
  sentenceIndex: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface StorySummaryDto {
  id: string;
  title: string;
  summary: string | null;
  childId: string | null;
  childName: string | null;
  themes: StoryTheme[];
  ageRange: AgeRange;
  status: StoryStatus;
  coverImageUrl: string | null;
  /** Duration of the primary narration, when one exists. */
  durationSeconds: number | null;
  narratorLabel: string | null;
  hasBook: boolean;
  hasIllustrations: boolean;
  isFavourite: boolean;
  createdAt: IsoDateTime;
}

export interface StoryDto extends StorySummaryDto {
  heroName: string;
  heroType: HeroType;
  durationTarget: StoryDuration;
  customPrompt: string | null;
  advancedSettings: StoryAdvancedSettings;
  moderationStatus: ModerationStatus;
  pages: StoryPageDto[];
  narrations: NarrationDto[];
  version: number;
  updatedAt: IsoDateTime;
}

export interface StoryProgressDto {
  storyId: string;
  narrationId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: IsoDateTime;
}

// ------------------------------------------------------- Illustrations

export interface IllustrationDto {
  id: string;
  kind: IllustrationKind;
  storyPageId: string | null;
  imageUrl: string | null;
  variantIndex: number;
  isSelected: boolean;
  status: GenerationStatus;
  /** Present only when this image failed; already a client-facing code. */
  errorCode: string | null;
}

export interface IllustrationSetDto {
  id: string;
  storyId: string;
  style: IllustrationStyle;
  status: GenerationStatus;
  illustrations: IllustrationDto[];
  /**
   * Real counts behind the "3/12 görsel" label. Sent as numbers rather than a
   * percentage so the app shows progress it can defend (§29).
   */
  readyCount: number;
  totalCount: number;
  createdAt: IsoDateTime;
}

/**
 * The character description reused for every page so the hero looks the same
 * throughout the book (§27).
 */
export interface CharacterBible {
  name: string;
  ageInYears: number | null;
  species: string;
  hair: string;
  eyes: string;
  skinTone: string;
  clothing: string;
  distinguishingFeatures: string[];
  colourPalette: string[];
  styleNotes: string;
}

// ---------------------------------------------------------------- Book

export interface BookPageDto {
  id: string;
  pageNumber: number;
  storyPageId: string | null;
  text: string;
  imageUrl: string | null;
  layout: BookPageLayout;
}

export interface BookDto {
  id: string;
  storyId: string;
  title: string;
  subtitle: string | null;
  dedication: string | null;
  backCoverText: string | null;
  coverImageUrl: string | null;
  status: BookStatus;
  pages: BookPageDto[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface BookRenderDto {
  id: string;
  bookId: string;
  kind: BookRenderKind;
  status: GenerationStatus;
  /** Signed URL to the rendered artifact; absent until the render succeeds. */
  fileUrl: string | null;
  errorCode: string | null;
  createdAt: IsoDateTime;
}

// ----------------------------------------------------- Orders & pricing

export interface AddressDto {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  /** İlçe */
  district: string;
  /** İl */
  city: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
}

export interface PrintProductDto {
  id: string;
  sku: string;
  bookSize: BookSize;
  coverType: CoverType;
  displayNameKey: string;
  /**
   * What a book within the included page allowance costs — the "…'den başlayan
   * fiyatlarla" figure on the format picker. The price actually charged depends
   * on the page count and is always computed by the server; the app asks
   * `POST /orders/quote` for it rather than doing this arithmetic itself.
   */
  basePrice: Money;
  perPagePrice: Money;
  includedPages: number;
  minPages: number;
  maxPages: number;
  productionDays: number;
}

/** Always computed by the backend; the client never sends a price (§82). */
export interface PriceQuoteDto {
  productId: string;
  quantity: number;
  pageCount: number;
  unitPrice: Money;
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  estimatedDeliveryDays: { min: number; max: number };
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: Money;
  quantity: number;
  bookTitle: string;
  coverImageUrl: string | null;
  trackingNumber: string | null;
  createdAt: IsoDateTime;
}

/**
 * What the app must do to complete a payment.
 *
 * Turkish 3D Secure returns an HTML form the app posts inside a web view rather
 * than a plain URL, so the shape is a union — a client that assumed a redirect
 * would break the day a real acquirer is switched on.
 */
export interface PaymentInitiationDto {
  paymentId: string;
  providerPaymentId: string;
  checkout:
    | { kind: 'redirect'; url: string }
    | { kind: 'html_form'; html: string }
    | { kind: 'none' };
}

export interface OrderDto extends OrderSummaryDto {
  bookId: string;
  bookSize: BookSize;
  coverType: CoverType;
  subtotal: Money;
  discount: Money;
  shipping: Money;
  shippingAddress: AddressDto;
  estimatedDeliveryDays: { min: number; max: number };
  events: Array<{ type: string; occurredAt: IsoDateTime }>;
  updatedAt: IsoDateTime;
}

// -------------------------------------------------------- Subscription

export interface SubscriptionDto {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  productId: string | null;
  startedAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
  trialEndsAt: IsoDateTime | null;
  willRenew: boolean;
  managementUrl: string | null;
}

// ---------------------------------------------------------------- Jobs

/**
 * Job progress reported to the client.
 *
 * `completedSteps / totalSteps` is derived from real pipeline state — the UI
 * must never invent a percentage (§29, §57).
 */
export interface AIJobDto {
  id: string;
  type: AIJobType;
  status: AIJobStatus;
  entityId: string | null;
  /** 0–100, computed from completed pipeline steps. */
  progress: number;
  /** Localisation key for the current stage, e.g. `job.illustration.page`. */
  currentStepKey: string | null;
  completedSteps: number;
  totalSteps: number;
  attempts: number;
  errorCode: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// ------------------------------------------------------- Notifications

export interface NotificationDto {
  id: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  data: Record<string, string>;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

// --------------------------------------------------------- App config

export interface AppUpdatePolicyDto {
  minSupportedVersion: string;
  latestVersion: string;
  /** The running build is below the supported floor and must be updated. */
  updateRequired: boolean;
  /** A newer build exists; the app may mention it, gently. */
  updateAvailable: boolean;
  messageKey: string | null;
}

export interface AppConfigDto {
  features: Record<FeatureFlagKey, boolean>;
  update: AppUpdatePolicyDto | null;
  /**
   * How long a raw voice recording is kept after the clone succeeds.
   *
   * Served rather than hardcoded in the app because the Voice Data screen states
   * this number to a parent as a promise, and a promise the retention job does
   * not honour is worse than no number at all.
   */
  voiceRawRetentionDays: number;
}

// --------------------------------------------------------------- Home

/** Where a listener left off, so Home can offer "Kaldığın yerden devam et". */
export interface ContinueListeningDto {
  story: StorySummaryDto;
  narrationId: string;
  positionSeconds: number;
  durationSeconds: number | null;
}

export interface HomeDto {
  greetingKey: string;
  children: ChildDto[];
  continueListening: ContinueListeningDto | null;
  recentStories: StorySummaryDto[];
  favourites: StorySummaryDto[];
  /** Non-null only when something is currently being generated. */
  activeJob: AIJobDto | null;
  storiesThisMonth: number;
  storyLimit: number;
}

// ------------------------------------------------------------- Assets

export interface SignedUploadDto {
  assetId: string;
  uploadUrl: string;
  /** Headers the client must echo back on the PUT for the signature to match. */
  headers: Record<string, string>;
  expiresAt: IsoDateTime;
  kind: AssetKind;
}

// ------------------------------------------------------------ Deletion

export interface DeletionRequestDto {
  id: string;
  type: DeletionRequestType;
  status: DeletionRequestStatus;
  scheduledFor: IsoDateTime;
  completedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

// ------------------------------------------------------- App versioning

export interface AppVersionPolicyDto {
  minSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  messageKey: string | null;
}
