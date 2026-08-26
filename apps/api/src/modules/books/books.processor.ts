import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type { JobPayload, JobProcessor, JobStepReporter } from '../../core/queue/queue.constants';
import { BookRenderService } from './book-render.service';

async function run(
  service: BookRenderService,
  payload: JobPayload,
  reporter: JobStepReporter,
): Promise<void> {
  if (!payload.entityId) {
    throw new Error('book render job has no render id');
  }
  await service.render(
    { bookRenderId: payload.entityId, userId: payload.userId, jobId: payload.jobId },
    reporter,
  );
}

/**
 * Two queues, one pipeline.
 *
 * The digital preview and the print file run the same code but on separate
 * queues, so a long print render cannot make a parent wait to flip through the
 * book they just finished.
 *
 * They are written as two independent classes rather than one abstract base:
 * Nest reads constructor types from `design:paramtypes`, which is emitted on the
 * class carrying the decorator. A subclass that inherits its constructor emits
 * none, and the container silently builds it with no arguments — the service
 * arrives as `undefined` and every job fails at the first property access.
 */
@Injectable()
export class BookPreviewProcessor implements JobProcessor {
  readonly type: AIJobType = 'BOOK_RENDER';
  readonly totalSteps = BookRenderService.TOTAL_STEPS;

  constructor(private readonly renderer: BookRenderService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    await run(this.renderer, payload, reporter);
  }
}

@Injectable()
export class PrintFileProcessor implements JobProcessor {
  readonly type: AIJobType = 'PRINT_FILE_GENERATION';
  readonly totalSteps = BookRenderService.TOTAL_STEPS;

  constructor(private readonly renderer: BookRenderService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    await run(this.renderer, payload, reporter);
  }
}
