import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, type ErrorCode } from '@masalim/types';
import { AppError, statusForErrorCode } from './app-error';

describe('AppError', () => {
  it('carries its domain code', () => {
    const error = new AppError(ERROR_CODES.STORY_NOT_FOUND);
    expect(error.code).toBe('STORY_NOT_FOUND');
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('keeps validation details for the client', () => {
    const error = new AppError(ERROR_CODES.VALIDATION_FAILED, 'bad', {
      details: [{ path: 'password', code: 'PASSWORD_TOO_SHORT' }],
    });
    expect(error.details).toEqual([{ path: 'password', code: 'PASSWORD_TOO_SHORT' }]);
  });

  it('carries log context for the logs', () => {
    const error = new AppError(ERROR_CODES.QUOTA_EXCEEDED, 'quota', {
      logContext: { quota: 'story_monthly_limit', used: 4 },
    });
    expect(error.logContext).toEqual({ quota: 'story_monthly_limit', used: 4 });
  });

  it('does not put the cause on the error itself', () => {
    // A provider error passed as `cause` must not become part of the object the
    // filter serialises. That the *response* only ever contains code, message
    // and requestId is asserted end-to-end in test/auth.test.ts.
    const error = new AppError(ERROR_CODES.VOICE_PROCESSING_FAILED, 'failed', {
      cause: new Error('ElevenLabs: invalid api key sk-secret'),
    });
    expect(JSON.stringify(error)).not.toContain('sk-secret');
  });
});

describe('status mapping', () => {
  it.each<[ErrorCode, HttpStatus]>([
    [ERROR_CODES.VALIDATION_FAILED, HttpStatus.BAD_REQUEST],
    [ERROR_CODES.UNAUTHORIZED, HttpStatus.UNAUTHORIZED],
    [ERROR_CODES.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED],
    [ERROR_CODES.REFRESH_TOKEN_REUSED, HttpStatus.UNAUTHORIZED],
    [ERROR_CODES.PREMIUM_REQUIRED, HttpStatus.FORBIDDEN],
    [ERROR_CODES.VOICE_CONSENT_REQUIRED, HttpStatus.FORBIDDEN],
    [ERROR_CODES.CHILD_NOT_FOUND, HttpStatus.NOT_FOUND],
    [ERROR_CODES.EMAIL_ALREADY_REGISTERED, HttpStatus.CONFLICT],
    [ERROR_CODES.QUOTA_EXCEEDED, HttpStatus.PAYMENT_REQUIRED],
    [ERROR_CODES.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS],
    [ERROR_CODES.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR],
  ])('maps %s to %i', (code, status) => {
    expect(statusForErrorCode(code)).toBe(status);
  });

  it('answers not-found for every ownership failure, so ids cannot be enumerated', () => {
    // A 403 would confirm the row exists. Every "belongs to someone else" path
    // in PolicyService funnels into one of these codes.
    const ownershipCodes: ErrorCode[] = [
      ERROR_CODES.CHILD_NOT_FOUND,
      ERROR_CODES.STORY_NOT_FOUND,
      ERROR_CODES.VOICE_PROFILE_NOT_FOUND,
      ERROR_CODES.BOOK_NOT_FOUND,
      ERROR_CODES.ORDER_NOT_FOUND,
      ERROR_CODES.ADDRESS_NOT_FOUND,
      ERROR_CODES.ASSET_NOT_FOUND,
      ERROR_CODES.JOB_NOT_FOUND,
      ERROR_CODES.NARRATION_NOT_FOUND,
      ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND,
    ];

    for (const code of ownershipCodes) {
      expect(statusForErrorCode(code)).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('treats a content-safety rejection as unprocessable, not as a server error', () => {
    // The story was written and refused on purpose; a 500 would make the app
    // offer "try again", which cannot help.
    expect(statusForErrorCode(ERROR_CODES.STORY_CONTENT_NOT_SUITABLE)).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('falls back to 500 for a code with no explicit mapping', () => {
    expect(statusForErrorCode('NOT_A_REAL_CODE' as ErrorCode)).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
