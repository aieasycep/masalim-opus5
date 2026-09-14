import { Injectable } from '@nestjs/common';
import type { AIJobDto } from '@masalim/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Clock } from '../time/clock';
import { JOB_PROGRESS_CHANNEL } from './queue.constants';

export interface JobProgressEvent {
  jobId: string;
  userId: string;
  job: AIJobDto;
}

/**
 * Persists job progress and fans it out to connected clients.
 *
 * Progress is written to the database first so a client that reconnects gets the
 * true current state, then published so anyone already listening sees it
 * immediately. The percentage is always derived from completed steps — nothing
 * here can invent a number.
 */
@Injectable()
export class JobProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
  ) {}

  async markStarted(jobId: string): Promise<void> {
    const job = await this.prisma.client.aIJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        startedAt: this.clock.now(),
        attempts: { increment: 1 },
      },
    });
    await this.publish(job);
  }

  async reportStep(
    jobId: string,
    stepKey: string,
    completedSteps: number,
    stepValues?: Record<string, string>,
  ): Promise<void> {
    const current = await this.prisma.client.aIJob.findUnique({ where: { id: jobId } });
    if (!current) return;

    const totalSteps = Math.max(1, current.totalSteps);
    const clamped = Math.min(completedSteps, totalSteps);

    const job = await this.prisma.client.aIJob.update({
      where: { id: jobId },
      data: {
        completedSteps: clamped,
        progress: Math.round((clamped / totalSteps) * 100),
        currentStepKey: stepKey,
        ...(stepValues ? { errorMessage: null } : {}),
      },
    });
    await this.publish(job, stepValues);
  }

  async markCompleted(jobId: string, entityId?: string): Promise<void> {
    const current = await this.prisma.client.aIJob.findUnique({ where: { id: jobId } });
    if (!current) return;

    const job = await this.prisma.client.aIJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        // Completed steps must land on the total, otherwise a client rendering
        // "4 / 12 görsel" would freeze at the last reported step forever.
        completedSteps: current.totalSteps,
        currentStepKey: null,
        finishedAt: this.clock.now(),
        ...(entityId ? { entityId } : {}),
      },
    });
    await this.publish(job);
  }

  async markFailed(jobId: string, errorCode: string, errorMessage?: string): Promise<void> {
    const job = await this.prisma.client.aIJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorCode,
        // Truncated: this is diagnostic text for the admin panel, and a provider
        // message can be enormous.
        ...(errorMessage ? { errorMessage: errorMessage.slice(0, 1000) } : {}),
        finishedAt: this.clock.now(),
      },
    });
    await this.publish(job);
  }

  private async publish(
    job: {
      id: string;
      userId: string;
      type: string;
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
    },
    stepValues?: Record<string, string>,
  ): Promise<void> {
    const event: JobProgressEvent & { stepValues?: Record<string, string> } = {
      jobId: job.id,
      userId: job.userId,
      job: {
        id: job.id,
        type: job.type as AIJobDto['type'],
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
      },
      ...(stepValues ? { stepValues } : {}),
    };

    await this.redis.publisher
      .publish(JOB_PROGRESS_CHANNEL, JSON.stringify(event))
      // A dropped progress event is cosmetic: the client polls as a fallback and
      // the database already holds the truth.
      .catch(() => undefined);
  }
}
