import { Global, Module } from '@nestjs/common';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';
import { ModerationService } from './moderation.service';

@Global()
@Module({
  providers: [ModerationService, AiUsageTracker],
  exports: [ModerationService, AiUsageTracker],
})
export class ModerationModule {}
