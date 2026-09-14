import {
  ERROR_CODES,
  NETWORK_ERROR_CODE,
  type ApiErrorBody,
  type ClientErrorCode,
} from '@masalim/types';

/**
 * Everything the app can fail with, in one type.
 *
 * The API always answers `{ error: { code, message, requestId } }`, so a screen
 * maps a `code` to localised copy and never has to interpret an HTTP status or a
 * raw message. Losing the connection is folded in as a code of its own, because
 * to a parent "no internet" and "server said no" are the same kind of event and
 * both need the same shape of handling.
 */
export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: Array<{ path: string; code: string }> | undefined;

  constructor(params: {
    code: ClientErrorCode;
    status: number;
    message?: string;
    requestId?: string | null;
    details?: Array<{ path: string; code: string }>;
  }) {
    super(params.message ?? params.code);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId ?? null;
    this.details = params.details;
  }

  /** True when retrying could plausibly succeed without the parent changing anything. */
  get isRetryable(): boolean {
    return (
      this.code === NETWORK_ERROR_CODE ||
      this.status >= 500 ||
      this.code === ERROR_CODES.SERVICE_UNAVAILABLE
    );
  }

  get isUnauthorised(): boolean {
    return this.status === 401;
  }

  /** The connection never reached the server, so nothing was changed by it. */
  static network(cause?: unknown): ApiError {
    return new ApiError({
      code: NETWORK_ERROR_CODE,
      status: 0,
      message: cause instanceof Error ? cause.message : 'Network request failed',
    });
  }

  static fromResponse(status: number, body: unknown): ApiError {
    const parsed = body as Partial<ApiErrorBody> | null;
    const error = parsed?.error;

    if (error?.code) {
      return new ApiError({
        code: error.code,
        status,
        message: error.message,
        requestId: error.requestId ?? null,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    // A response that is not in the standard shape means something upstream of
    // the application answered — a proxy, a load balancer, a 502 page.
    return new ApiError({
      code: status >= 500 ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.INTERNAL_ERROR,
      status,
      message: `Unexpected response (${String(status)})`,
    });
  }
}

export function isApiError(value: unknown): value is ApiError {
  // Not `instanceof`: a bundler can end up with two copies of this module, and
  // a mis-identified error would be rendered as an unknown failure.
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'ApiError' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}
