import { Module, type OnModuleInit } from '@nestjs/common';
import { JobProcessorRegistry } from '../../core/queue/job-processor.registry';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';
import { VoiceCloneService } from './voice-clone.service';
import { VoiceCloneProcessor } from './voice-clone.processor';

@Module({
  controllers: [VoicesController],
  providers: [VoicesService, VoiceCloneService, VoiceCloneProcessor],
  exports: [VoicesService],
})
export class VoicesModule implements OnModuleInit {
  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly processor: VoiceCloneProcessor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.processor);
  }
}
