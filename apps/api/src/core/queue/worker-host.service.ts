import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { ERROR_CODES } from '@masalim/types';
import { RedisService } from '../redis/redis.service';
import { AppLogger } from '../logger/logger.service';
import { AppError, statusForErrorCode } from '../errors/app-error';
import { JobProgressService } from './job-progress.service';
import { JobProcessorRegistry } from './job-processor.registry';
import {
  QUEUE_NAMES,
  type JobPayload,
  type JobProcessor,
  type JobStepReporter,
} from './queue.constants';
import { shouldRunWorkers } from './role';

/**
 * Runs the registered job processors.
 *
 * Only started by the worker entrypoint — the HTTP process enqueues work but
 * never executes it, so a burst of illustration jobs cannot make the API slow to
 * answer a parent opening the Library.
 */
@Injectable()
export class WorkerHostService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly workers: Worker[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly progress: JobProgressService,
    private readonly registry: JobProcessorRegistry,
    private readonly logger: AppLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!shouldRunWorkers()) return;
    this.start();
  }

  /** Exposed so integration tests can run processors in-process. */
  start(): void {
    for (const processor of this.registry.all()) {
      const queueName = QUEUE_NAMES[processor.type];
      const worker = new Worker(
        queueName,
        async (job: Job<JobPayload>) => this.run(processor, job),
        {
          connection: this.redis.createQueueConnection(),
          // Illustration jobs are long and provider-bound, so a small
          // concurrency keeps one user from monopolising a worker.
          concurrency: 4,
        },
      );

      worker.on('failed', (job, error) => {
        this.logger
          .child({ jobId: job?.data.jobId, queue: queueName })
          .error({ err: error }, 'job failed');
      });

      this.workers.push(worker);
      this.logger.pino.info({ queue: queueName }, 'worker listening');
    }

    if (this.workers.length === 0) {
      this.logger.pino.warn('no job processors registered');
    }
  }

  private async run(processor: JobProcessor, job: Job<JobPayload>): Promise<void> {
    const { jobId } = job.data;
    const log = this.logger.child({ jobId, type: processor.type, userId: job.data.userId });

    await this.progress.markStarted(jobId);

    const reporter: JobStepReporter = {
      step: (stepKey, completedSteps, values) =>
        this.progress.reportStep(jobId, stepKey, completedSteps, values),
    };

    try {
      await processor.process(job.data, reporter);
      await this.progress.markCompleted(jobId);
      log.info('job completed');
    } catch (error) {
      const isFinalAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
      const code = error instanceof AppError ? error.code : ERROR_CODES.INTERNAL_ERROR;

      // A 4xx-class domain error is a verdict, not a hiccup: an unsuitable
      // prompt or a missing story will fail identically on every retry. Retrying
      // would burn three provider calls and leave a parent watching a progress
      // bar for half a minute before the same message appears.
      const retryable =
        !(error instanceof AppError) || statusForErrorCode(code) >= 500;

      // Otherwise the failure is only recorded on the last attempt; the row
      // would flash FAILED between retries and the app would tell the parent
      // their story was lost while it is still being written.
      if (!retryable || isFinalAttempt) {
        await this.progress.markFailed(
          jobId,
          code,
          error instanceof Error ? error.message : String(error),
        );
      }

      log.warn({ err: error, isFinalAttempt, retryable }, 'job attempt failed');

      if (!retryable) {
        throw new UnrecoverableError(
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
