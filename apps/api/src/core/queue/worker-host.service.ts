import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { ERROR_CODES } from '@masalim/types';
import { RedisService } from '../redis/redis.service';
import { AppLogger } from '../logger/logger.service';
import { AppError } from '../errors/app-error';
import { JobProgressService } from './job-progress.service';
import {
  JOB_PROCESSOR,
  QUEUE_NAMES,
  type JobPayload,
  type JobProcessor,
  type JobStepReporter,
} from './queue.constants';

/**
 * Runs the registered job processors.
 *
 * Only started by the worker entrypoint — the HTTP process enqueues work but
 * never executes it, so a burst of illustration jobs cannot make the API slow to
 * answer a parent opening the Library.
 */
@Injectable()
export class WorkerHostService implements OnModuleInit, OnModuleDestroy {
  private readonly workers: Worker[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly progress: JobProgressService,
    private readonly logger: AppLogger,
    @Optional()
    @Inject(JOB_PROCESSOR)
    private readonly processors: JobProcessor[] = [],
  ) {}

  onModuleInit(): void {
    if (process.env.MASALIM_ROLE !== 'worker') return;
    this.start();
  }

  /** Exposed so integration tests can run processors in-process. */
  start(): void {
    for (const processor of this.processors) {
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

    if (this.processors.length === 0) {
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
      const code =
        error instanceof AppError ? error.code : ERROR_CODES.INTERNAL_ERROR;

      // Only record a terminal failure on the last attempt; otherwise the row
      // would flash FAILED between retries and the app would tell the parent
      // their story was lost while it is still being written.
      if (isFinalAttempt) {
        await this.progress.markFailed(
          jobId,
          code,
          error instanceof Error ? error.message : String(error),
        );
      }

      log.warn({ err: error, isFinalAttempt }, 'job attempt failed');
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
