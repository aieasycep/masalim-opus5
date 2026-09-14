/**
 * Canonical error codes.
 *
 * The API only ever returns a code; the client turns it into a localised,
 * parent-friendly sentence. Raw provider errors and moderation reasons never
 * reach the user interface.
 */
export const ERROR_CODES = {
  // --- Generic ---------------------------------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  APP_UPDATE_REQUIRED: 'APP_UPDATE_REQUIRED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',

  // --- Auth ------------------------------------------------------------
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  SOCIAL_AUTH_FAILED: 'SOCIAL_AUTH_FAILED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',

  // --- Entitlements ----------------------------------------------------
  PREMIUM_REQUIRED: 'PREMIUM_REQUIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  VOICE_PROFILE_LIMIT_REACHED: 'VOICE_PROFILE_LIMIT_REACHED',

  // --- Children --------------------------------------------------------
  CHILD_NOT_FOUND: 'CHILD_NOT_FOUND',

  // --- Story -----------------------------------------------------------
  STORY_NOT_FOUND: 'STORY_NOT_FOUND',
  STORY_GENERATION_FAILED: 'STORY_GENERATION_FAILED',
  STORY_GENERATION_TIMEOUT: 'STORY_GENERATION_TIMEOUT',
  /** Shown as the gentle "let's change the idea together" message. */
  STORY_CONTENT_NOT_SUITABLE: 'STORY_CONTENT_NOT_SUITABLE',
  STORY_NOT_READY: 'STORY_NOT_READY',

  // --- Voice -----------------------------------------------------------
  VOICE_PROFILE_NOT_FOUND: 'VOICE_PROFILE_NOT_FOUND',
  VOICE_CONSENT_REQUIRED: 'VOICE_CONSENT_REQUIRED',
  VOICE_PROCESSING_FAILED: 'VOICE_PROCESSING_FAILED',
  VOICE_NOT_READY: 'VOICE_NOT_READY',
  AUDIO_TOO_SHORT: 'AUDIO_TOO_SHORT',
  AUDIO_TOO_LONG: 'AUDIO_TOO_LONG',
  AUDIO_TOO_QUIET: 'AUDIO_TOO_QUIET',
  AUDIO_TOO_NOISY: 'AUDIO_TOO_NOISY',
  AUDIO_CLIPPED: 'AUDIO_CLIPPED',
  AUDIO_MOSTLY_SILENT: 'AUDIO_MOSTLY_SILENT',
  AUDIO_FILE_CORRUPT: 'AUDIO_FILE_CORRUPT',

  // --- Narration -------------------------------------------------------
  NARRATION_NOT_FOUND: 'NARRATION_NOT_FOUND',
  NARRATION_FAILED: 'NARRATION_FAILED',
  NARRATION_VOICE_REQUIRED: 'NARRATION_VOICE_REQUIRED',

  // --- Illustrations ---------------------------------------------------
  ILLUSTRATION_FAILED: 'ILLUSTRATION_FAILED',
  ILLUSTRATION_SET_NOT_FOUND: 'ILLUSTRATION_SET_NOT_FOUND',

  // --- Books -----------------------------------------------------------
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  BOOK_RENDER_FAILED: 'BOOK_RENDER_FAILED',
  BOOK_NOT_READY_FOR_PRINT: 'BOOK_NOT_READY_FOR_PRINT',

  // --- Orders & payments -----------------------------------------------
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_CREATION_FAILED: 'ORDER_CREATION_FAILED',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  ADDRESS_INVALID: 'ADDRESS_INVALID',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',

  // --- Uploads ---------------------------------------------------------
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  UPLOAD_TYPE_NOT_ALLOWED: 'UPLOAD_TYPE_NOT_ALLOWED',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',

  // --- Jobs ------------------------------------------------------------
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_NOT_RETRYABLE: 'JOB_NOT_RETRYABLE',

  // --- Subscriptions ---------------------------------------------------
  SUBSCRIPTION_VERIFICATION_FAILED: 'SUBSCRIPTION_VERIFICATION_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** The one and only shape the API returns for a failure (master prompt §44). */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    /** Field-level detail for VALIDATION_FAILED; never contains provider internals. */
    details?: Array<{ path: string; code: string }>;
  };
}

/** Client-side sentinel for "the request never reached the server". */
export const NETWORK_ERROR_CODE = 'NETWORK_UNAVAILABLE' as const;
export type NetworkErrorCode = typeof NETWORK_ERROR_CODE;

/** Everything a client may need to translate, including the offline case. */
export type ClientErrorCode = ErrorCode | NetworkErrorCode;
