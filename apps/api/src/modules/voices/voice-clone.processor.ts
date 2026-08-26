import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type { JobPayload, JobProcessor, JobStepReporter } from '../../core/queue/queue.constants';
import { VoiceCloneService } from './voice-clone.service';

@Injectable()
export class VoiceCloneProcessor implements JobProcessor {
  readonly type: AIJobType = 'VOICE_CLONE';
  readonly totalSteps = VoiceCloneService.TOTAL_STEPS;

  constructor(private readonly clone: VoiceCloneService) {}

  async process(payload: JobPayload, reporter: JobStepReporter): Promise<void> {
    if (!payload.entityId) {
      throw new Error('voice clone job has no voice profile id');
    }
    await this.clone.run(
      { voiceProfileId: payload.entityId, userId: payload.userId, jobId: payload.jobId },
      reporter,
    );
  }
}
