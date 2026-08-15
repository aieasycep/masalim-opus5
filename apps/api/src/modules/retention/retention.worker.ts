import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { RedisService } from '../../core/redis/redis.service';
import { AppLogger } from '../../core/logger/logger.service';
import { DeletionRequestService } from './deletion-request.service';
import { VoiceRetentionService } from './voice-retention.service';
import { RetentionQueueService } from './retention.queue';
import {
  RETENTION_JOBS,
  RETENTION_QUEUE_NAME,
  isRetentionJobName,
} from './retention.constants';

/**
 * Runs the retention passes.
 *
 * Started only in the worker process, like every other queue consumer here: the
 * HTTP process must stay responsive at bedtime, and a sweep that walks a bucket
 * is exactly the kind of work that would make it not.
 *
 * Concurrency is one on purpose. Two passes over the same due requests would
 * both claim rows correctly — the claim is an optimistic update — but they would
 * spend the time contending instead of deleting, and destructive work is easier
 * to reason about when it happens in one place at a time.
 */
@Injectable()
export class RetentionWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private worker: Worker | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly queue: RetentionQueueService,
    private readonly deletions: DeletionRequestService,
    private readonly retention: VoiceRetentionService,
    private readonly logger: AppLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.MASALIM_ROLE !== 'worker') return;
    await this.start();
  }

  /** Exposed so integration tests can run the passes in-process. */
  async start(): Promise<void> {
    await this.queue.registerSchedules();

    this.worker = new Worker(
      RETENTION_QUEUE_NAME,
      async (job: Job) => this.run(job.name),
      { connection: this.redis.createQueueConnection(), concurrency: 1 },
    );

    this.worker.on('failed', (job, error) => {
      this.logger
        .child({ queue: RETENTION_QUEUE_NAME, job: job?.name })
        .error({ err: error }, 'retention pass failed');
    });

    this.logger.pino.info({ queue: RETENTION_QUEUE_NAME }, 'retention worker listening');
  }

  private async run(name: string): Promise<void> {
    if (!isRetentionJobName(name)) {
      this.logger.pino.warn({ job: name }, 'unknown retention job');
      return;
    }

    if (name === RETENTION_JOBS.DELETION_REQUESTS) {
      const summary = await this.deletions.processDue();
      if (summary.claimed > 0) {
        this.logger.pino.info(summary, 'deletion requests processed');
      }
      return;
    }

    await this.retention.sweep();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
