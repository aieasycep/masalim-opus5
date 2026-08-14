import type { AIJobDto } from '@masalim/types';
import { WorkerHostService } from '../../src/core/queue/worker-host.service';
import { authHeader, type SignedUpUser, type TestContext } from './test-app';

/**
 * Runs the registered job processors inside the test process.
 *
 * The tests go through real BullMQ and real Redis rather than calling the
 * pipeline directly, so the queue wiring — payloads, idempotency, progress
 * publishing, retry policy — is exercised too. Those are exactly the parts that
 * break silently in production.
 */
export function startWorkers(context: TestContext): void {
  context.app.get(WorkerHostService).start();
}

export interface WaitForJobOptions {
  timeoutMs?: number;
  pollMs?: number;
}

/** Polls `GET /jobs/:id` until the job settles, mirroring the app's fallback. */
export async function waitForJob(
  context: TestContext,
  user: SignedUpUser,
  jobId: string,
  options: WaitForJobOptions = {},
): Promise<AIJobDto> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  let last: AIJobDto | null = null;

  while (Date.now() < deadline) {
    const response = await context
      .http()
      .get(`/jobs/${jobId}`)
      .set(...authHeader(user))
      .expect(200);

    last = response.body as AIJobDto;
    if (last.status === 'COMPLETED' || last.status === 'FAILED') {
      return last;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `job ${jobId} did not settle within ${timeoutMs}ms (last status: ${last?.status ?? 'unknown'})`,
  );
}
