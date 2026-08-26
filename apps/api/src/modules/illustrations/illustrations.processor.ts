import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type { JobPayload, JobProcessor, JobStepReporter } from '../../core/queue/queue.constants';
import { IllustrationRenderService } from './illustration-render.service';

@Injectable()
export class IllustrationsProcessor implements JobProcessor {
  readonly type: AIJobType = 'ILLUSTRATION_GENERATION';
  /** Nominal; a whole-set job overrides this with its real page count. */
  readonly totalSteps = 1;

  constructor(private readonly render: IllustrationRenderService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    if (!payload.entityId) {
      throw new Error('illustration job has no entity id');
    }

    if (payload.data.mode === 'variant') {
      await this.render.renderVariant(
        { illustrationId: payload.entityId, userId: payload.userId, jobId: payload.jobId },
        reporter,
      );
      return;
    }

    await this.render.renderSet(
      { illustrationSetId: payload.entityId, userId: payload.userId, jobId: payload.jobId },
      reporter,
    );
  }
}
