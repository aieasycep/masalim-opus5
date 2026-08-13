import { Controller, Get, Param, Post, Res, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import type { AIJobDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { PolicyService } from '../../core/policy/policy.service';
import { QueueService } from '../../core/queue/queue.service';
import { RedisService } from '../../core/redis/redis.service';
import { JOB_PROGRESS_CHANNEL } from '../../core/queue/queue.constants';
import type { JobProgressEvent } from '../../core/queue/job-progress.service';

interface SseMessage {
  data: AIJobDto;
}

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly policy: PolicyService,
    private readonly queue: QueueService,
    private readonly redis: RedisService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Current state of a generation job (polling fallback)' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') jobId: string,
  ): Promise<AIJobDto> {
    const job = await this.policy.assertJob(userId, jobId);
    return this.queue.toDto(job);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed job, keeping its history' })
  async retry(
    @CurrentUserId() userId: string,
    @Param('id') jobId: string,
  ): Promise<AIJobDto> {
    await this.policy.assertJob(userId, jobId);
    return this.queue.retry(jobId);
  }

  /**
   * Live progress for one job.
   *
   * Ownership is checked before the stream opens and every published event is
   * filtered by user id, so subscribing cannot become a way to watch another
   * family's generations.
   */
  @Sse(':id/stream')
  @ApiOperation({ summary: 'Server-sent progress events for a job' })
  async stream(
    @CurrentUserId() userId: string,
    @Param('id') jobId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Observable<SseMessage>> {
    const job = await this.policy.assertJob(userId, jobId);

    // Proxies otherwise buffer SSE and the parent sees nothing until the end.
    response.setHeader('X-Accel-Buffering', 'no');
    response.setHeader('Cache-Control', 'no-cache, no-transform');

    return new Observable<SseMessage>((subscriber) => {
      // Emit the current state immediately so a client that connects late is
      // never left staring at an empty progress bar.
      subscriber.next({ data: this.queue.toDto(job) });

      const connection = this.redis.subscriber.duplicate();
      let closed = false;

      const handleMessage = (channel: string, raw: string): void => {
        if (channel !== JOB_PROGRESS_CHANNEL) return;
        try {
          const event = JSON.parse(raw) as JobProgressEvent;
          if (event.jobId !== jobId || event.userId !== userId) return;
          subscriber.next({ data: event.job });
          if (event.job.status === 'COMPLETED' || event.job.status === 'FAILED') {
            subscriber.complete();
          }
        } catch {
          // A malformed message must not tear down a parent's progress stream.
        }
      };

      void connection.subscribe(JOB_PROGRESS_CHANNEL).catch((error: unknown) => {
        subscriber.error(error);
      });
      connection.on('message', handleMessage);

      return () => {
        if (closed) return;
        closed = true;
        connection.off('message', handleMessage);
        void connection.quit().catch(() => undefined);
      };
    });
  }
}
