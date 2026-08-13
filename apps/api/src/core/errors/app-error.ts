import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@masalim/types';

/** Maps a domain error code to the HTTP status the client should see. */
const STATUS_BY_CODE: Partial<Record<ErrorCode, HttpStatus>> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  NARRATION_VOICE_REQUIRED: HttpStatus.BAD_REQUEST,
  ADDRESS_INVALID: HttpStatus.BAD_REQUEST,
  STORY_NOT_READY: HttpStatus.BAD_REQUEST,
  VOICE_NOT_READY: HttpStatus.BAD_REQUEST,
  BOOK_NOT_READY_FOR_PRINT: HttpStatus.BAD_REQUEST,
  AUDIO_TOO_SHORT: HttpStatus.BAD_REQUEST,
  AUDIO_TOO_LONG: HttpStatus.BAD_REQUEST,
  AUDIO_TOO_QUIET: HttpStatus.BAD_REQUEST,
  AUDIO_TOO_NOISY: HttpStatus.BAD_REQUEST,
  AUDIO_CLIPPED: HttpStatus.BAD_REQUEST,
  AUDIO_MOSTLY_SILENT: HttpStatus.BAD_REQUEST,
  AUDIO_FILE_CORRUPT: HttpStatus.BAD_REQUEST,
  UPLOAD_TOO_LARGE: HttpStatus.BAD_REQUEST,
  UPLOAD_TYPE_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  STORY_CONTENT_NOT_SUITABLE: HttpStatus.UNPROCESSABLE_ENTITY,

  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  TOKEN_EXPIRED: HttpStatus.UNAUTHORIZED,
  TOKEN_INVALID: HttpStatus.UNAUTHORIZED,
  REFRESH_TOKEN_REUSED: HttpStatus.UNAUTHORIZED,
  SOCIAL_AUTH_FAILED: HttpStatus.UNAUTHORIZED,
  ACCOUNT_DELETED: HttpStatus.UNAUTHORIZED,

  FORBIDDEN: HttpStatus.FORBIDDEN,
  PREMIUM_REQUIRED: HttpStatus.FORBIDDEN,
  VOICE_CONSENT_REQUIRED: HttpStatus.FORBIDDEN,
  FEATURE_DISABLED: HttpStatus.FORBIDDEN,
  APP_UPDATE_REQUIRED: HttpStatus.FORBIDDEN,

  NOT_FOUND: HttpStatus.NOT_FOUND,
  CHILD_NOT_FOUND: HttpStatus.NOT_FOUND,
  STORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  VOICE_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  NARRATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  ILLUSTRATION_SET_NOT_FOUND: HttpStatus.NOT_FOUND,
  BOOK_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ADDRESS_NOT_FOUND: HttpStatus.NOT_FOUND,
  ASSET_NOT_FOUND: HttpStatus.NOT_FOUND,
  JOB_NOT_FOUND: HttpStatus.NOT_FOUND,

  CONFLICT: HttpStatus.CONFLICT,
  EMAIL_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  ORDER_NOT_CANCELLABLE: HttpStatus.CONFLICT,
  JOB_NOT_RETRYABLE: HttpStatus.CONFLICT,
  VOICE_PROFILE_LIMIT_REACHED: HttpStatus.CONFLICT,

  QUOTA_EXCEEDED: HttpStatus.PAYMENT_REQUIRED,

  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,

  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  PRODUCT_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

export interface AppErrorOptions {
  /** Field-level detail for validation failures. Never provider internals. */
  details?: Array<{ path: string; code: string }>;
  /** Internal context for the logs. Never serialised into the response. */
  cause?: unknown;
  logContext?: Record<string, unknown>;
}

/**
 * The only error type controllers and services should throw.
 *
 * It carries a domain code; the exception filter turns that into the standard
 * response body. The English `message` here is for logs and the OpenAPI docs —
 * the client renders its own localised copy from the code.
 */
export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details: Array<{ path: string; code: string }> | undefined;
  readonly logContext: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message?: string, options: AppErrorOptions = {}) {
    const status = STATUS_BY_CODE[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    super(message ?? code, status, options.cause ? { cause: options.cause } : undefined);
    this.code = code;
    this.details = options.details;
    this.logContext = options.logContext;
    this.name = 'AppError';
  }

  static notFound(code: ErrorCode = ERROR_CODES.NOT_FOUND, message?: string): AppError {
    return new AppError(code, message);
  }

  static forbidden(code: ErrorCode = ERROR_CODES.FORBIDDEN, message?: string): AppError {
    return new AppError(code, message);
  }
}

export function statusForErrorCode(code: ErrorCode): HttpStatus {
  return STATUS_BY_CODE[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
}
