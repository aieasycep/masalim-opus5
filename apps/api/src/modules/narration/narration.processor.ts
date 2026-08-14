import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type { JobPayload, JobProcessor, JobStepReporter } from '../../core/queue/queue.constants';
import { NarrationRenderService } from './narration-render.service';

@Injectable()
export class NarrationProcessor implements JobProcessor {
  readonly type: AIJobType = 'NARRATION_GENERATION';
  readonly totalSteps = NarrationRenderService.TOTAL_STEPS;

  constructor(private readonly render: NarrationRenderService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    if (!payload.entityId) {
      throw new Error('narration job has no narration id');
    }
    await this.render.render(
      { narrationId: payload.entityId, userId: payload.userId, jobId: payload.jobId },
      reporter,
    );
  }
}
