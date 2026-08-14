import type { AIJobDto } from '@masalim/types';
import type { HttpClient } from './http';
import { ApiError } from './errors';

export interface JobProgressHandlers {
  onProgress: (job: AIJobDto) => void;
  onSettled: (job: AIJobDto) => void;
  onError: (error: ApiError) => void;
}

export interface JobProgressOptions {
  /** How often to ask when streaming is unavailable. */
  pollIntervalMs?: number;
  /** Gives up rather than watching a stuck job forever. */
  timeoutMs?: number;
}

const DEFAULT_POLL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Watches a generation job.
 *
 * Polling rather than server-sent events. React Native's `fetch` does not expose
 * a readable stream, and the polyfills that fake one bring their own failure
 * modes; the server publishes a real `/jobs/:id/stream` for clients that can use
 * it, and the polling fallback it also exposes is what this uses. A story takes
 * tens of seconds, so a request every 1.5s is unnoticeable next to the work.
 *
 * Returns a function that stops the watch — screens call it on unmount, and
 * failing to would leave a request loop running behind whatever the parent
 * navigated to.
 */
export function watchJob(
  http: HttpClient,
  jobId: string,
  handlers: JobProgressHandlers,
  options: JobProgressOptions = {},
): () => void {
  const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;

  const stop = (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;

    try {
      const job = await http.get<AIJobDto>(`/jobs/${jobId}`);
      consecutiveFailures = 0;

      if (stopped) return;

      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        handlers.onSettled(job);
        stop();
        return;
      }

      handlers.onProgress(job);
    } catch (error) {
      consecutiveFailures += 1;

      // One dropped request on a phone connection is normal; three in a row is
      // a real problem worth telling the parent about.
      if (consecutiveFailures >= 3) {
        handlers.onError(
          error instanceof ApiError ? error : ApiError.network(error),
        );
        stop();
        return;
      }
    }

    if (Date.now() > deadline) {
      handlers.onError(
        new ApiError({ code: 'STORY_GENERATION_TIMEOUT', status: 408, message: 'Job timed out' }),
      );
      stop();
      return;
    }

    timer = setTimeout(() => void tick(), pollMs);
  };

  void tick();
  return stop;
}
