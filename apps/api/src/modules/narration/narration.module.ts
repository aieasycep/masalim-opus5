import { Module, type OnModuleInit } from '@nestjs/common';
import { JobProcessorRegistry } from '../../core/queue/job-processor.registry';
import { NarrationController } from './narration.controller';
import { NarrationService } from './narration.service';
import { NarrationRenderService } from './narration-render.service';
import { NarrationProcessor } from './narration.processor';

@Module({
  controllers: [NarrationController],
  providers: [NarrationService, NarrationRenderService, NarrationProcessor],
  exports: [NarrationService],
})
export class NarrationModule implements OnModuleInit {
  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly processor: NarrationProcessor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.processor);
  }
}
