import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../core/redis/redis.service';
import { AppLogger } from '../../core/logger/logger.service';
import {
  DELETION_SCAN_INTERVAL_MS,
  RETENTION_JOBS,
  RETENTION_QUEUE_NAME,
  RETENTION_SWEEP_CRON,
  RETENTION_SWEEP_TIMEZONE,
  type RetentionJobName,
} from './retention.constants';

/**
 * Retention jobs are cheap to repeat and expensive to run twice concurrently,
 * so a failed attempt is left for the next scheduled pass rather than retried
 * on a tight backoff. Nothing is lost: the DeletionRequest row and the
 * retention window are the state, and both survive a dropped job.
 */
const RETENTION_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 200 },
  removeOnFail: { age: 30 * 24 * 60 * 60 },
} as const;

/**
 * Owns the retention queue and its schedules.
 *
 * The schedules live in Redis under stable ids, so several API or worker
 * replicas booting at once converge on one timer instead of one per process.
 */
@Injectable()
export class RetentionQueueService implements OnModuleDestroy {
  private queue: Queue | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  private get connection(): Queue {
    this.queue ??= new Queue(RETENTION_QUEUE_NAME, {
      connection: this.redis.createQueueConnection(),
      defaultJobOptions: RETENTION_JOB_OPTIONS,
    });
    return this.queue;
  }

  /** Installs (or updates) the two recurring passes. Safe to call repeatedly. */
  async registerSchedules(): Promise<void> {
    await this.connection.upsertJobScheduler(
      RETENTION_JOBS.DELETION_REQUESTS,
      { every: DELETION_SCAN_INTERVAL_MS },
      { name: RETENTION_JOBS.DELETION_REQUESTS },
    );

    await this.connection.upsertJobScheduler(
      RETENTION_JOBS.RETENTION_SWEEP,
      { pattern: RETENTION_SWEEP_CRON, tz: RETENTION_SWEEP_TIMEZONE },
      { name: RETENTION_JOBS.RETENTION_SWEEP },
    );

    this.logger.pino.info(
      { queue: RETENTION_QUEUE_NAME, sweep: RETENTION_SWEEP_CRON },
      'retention schedules registered',
    );
  }

  /**
   * Runs a pass now instead of waiting for the next tick.
   *
   * No deduplication id: the worker takes one retention job at a time, so a
   * burst of callers queues behind the pass already running rather than racing
   * it, and a scan that finds nothing left to do costs one query.
   */
  async runNow(name: RetentionJobName): Promise<void> {
    await this.connection.add(name, {});
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
