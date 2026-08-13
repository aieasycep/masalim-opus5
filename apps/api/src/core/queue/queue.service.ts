import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ERROR_CODES, type AIJobDto, type AIJobType } from '@masalim/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../errors/app-error';
import { Clock } from '../time/clock';
import { AppLogger } from '../logger/logger.service';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, type JobPayload } from './queue.constants';

export interface EnqueueParams {
  type: AIJobType;
  userId: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
  totalSteps: number;
  /** Reusing a key returns the existing job instead of starting a second one. */
  idempotencyKey: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<AIJobType, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  private queueFor(type: AIJobType): Queue {
    let queue = this.queues.get(type);
    if (!queue) {
      queue = new Queue(QUEUE_NAMES[type], {
        connection: this.redis.createQueueConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(type, queue);
    }
    return queue;
  }

  /**
   * Creates the AIJob row and enqueues the work.
   *
   * The row is written first so the client always has something to poll, even if
   * Redis is briefly unavailable — a job that exists but has not started is far
   * better UX than a request that appears to have vanished.
   */
  async enqueue(params: EnqueueParams): Promise<AIJobDto> {
    const existing = await this.prisma.client.aIJob.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return this.toDto(existing);
    }

    const job = await this.prisma.client.aIJob.create({
      data: {
        userId: params.userId,
        type: params.type,
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
        totalSteps: params.totalSteps,
        maxAttempts: DEFAULT_JOB_OPTIONS.attempts,
        idempotencyKey: params.idempotencyKey,
      },
    });

    const payload: JobPayload = {
      jobId: job.id,
      userId: params.userId,
      entityId: params.entityId ?? null,
      data: params.data ?? {},
    };

    try {
      const queued = await this.queueFor(params.type).add(params.type, payload, {
        jobId: job.id,
      });
      await this.prisma.client.aIJob.update({
        where: { id: job.id },
        data: { queueJobId: queued.id ?? null },
      });
    } catch (error) {
      await this.prisma.client.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
          finishedAt: this.clock.now(),
        },
      });
      this.logger
        .child({ jobId: job.id, type: params.type })
        .error({ err: error }, 'failed to enqueue job');
      throw new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, 'Could not queue the job');
    }

    return this.toDto({ ...job, status: 'QUEUED' });
  }

  /** Re-runs a failed job, keeping the same AIJob row and its history. */
  async retry(jobId: string): Promise<AIJobDto> {
    const job = await this.prisma.client.aIJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new AppError(ERROR_CODES.JOB_NOT_FOUND);
    }
    if (job.status !== 'FAILED') {
      throw new AppError(ERROR_CODES.JOB_NOT_RETRYABLE, 'Only failed jobs can be retried');
    }

    const reset = await this.prisma.client.aIJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        progress: 0,
        completedSteps: 0,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
      },
    });

    const payload: JobPayload = {
      jobId: job.id,
      userId: job.userId,
      entityId: job.entityId,
      data: {},
    };

    // A fresh BullMQ id, because the previous one is retained in the failed set.
    await this.queueFor(job.type).add(job.type, payload, {
      jobId: `${job.id}:retry:${job.attempts + 1}`,
    });

    return this.toDto(reset);
  }

  toDto(job: {
    id: string;
    type: AIJobType;
    status: string;
    entityId: string | null;
    progress: number;
    currentStepKey: string | null;
    completedSteps: number;
    totalSteps: number;
    attempts: number;
    errorCode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AIJobDto {
    return {
      id: job.id,
      type: job.type,
      status: job.status as AIJobDto['status'],
      entityId: job.entityId,
      progress: job.progress,
      currentStepKey: job.currentStepKey,
      completedSteps: job.completedSteps,
      totalSteps: job.totalSteps,
      attempts: job.attempts,
      errorCode: job.errorCode,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
