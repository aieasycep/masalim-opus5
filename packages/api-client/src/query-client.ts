import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';

/** Long enough that going back to a screen does not refetch; short enough to feel live. */
const STALE_TIME_MS = 30_000;
const MAX_RETRIES = 3;

/**
 * Retry policy.
 *
 * Only things that could plausibly succeed on a second attempt. A 404, a
 * validation failure or a quota refusal will return exactly the same answer
 * three times over, and retrying them just makes a parent wait longer for the
 * message they were always going to get.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (isApiError(error)) return error.isRetryable;
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // React Native has no window focus; the app's own foreground listener
        // drives refetching instead.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // A mutation is a parent's deliberate action. Silently repeating one
        // risks doing it twice; anything that must survive a retry carries an
        // idempotency key and is retried explicitly by the screen.
        retry: false,
      },
    },
  });
}
