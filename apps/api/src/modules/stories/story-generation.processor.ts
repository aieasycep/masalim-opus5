import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type {
  JobPayload,
  JobProcessor,
  JobStepReporter,
} from '../../core/queue/queue.constants';
import { StoryGenerationService } from './story-generation.service';

/**
 * Adapts the story pipeline to the queue runner.
 *
 * The processor holds no logic of its own: keeping the pipeline in a plain
 * service means it can be driven directly from a test without a Redis worker.
 */
@Injectable()
export class StoryGenerationProcessor implements JobProcessor {
  readonly type: AIJobType = 'STORY_GENERATION';
  readonly totalSteps = StoryGenerationService.TOTAL_STEPS;

  constructor(private readonly generation: StoryGenerationService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    if (!payload.entityId) {
      throw new Error('story generation job has no story id');
    }

    await this.generation.generate(
      {
        storyId: payload.entityId,
        userId: payload.userId,
        jobId: payload.jobId,
      },
      reporter,
    );
  }
}
