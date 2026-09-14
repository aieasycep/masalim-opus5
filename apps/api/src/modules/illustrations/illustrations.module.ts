import { Module, type OnModuleInit } from '@nestjs/common';
import { JobProcessorRegistry } from '../../core/queue/job-processor.registry';
import { IllustrationsController } from './illustrations.controller';
import { IllustrationsService } from './illustrations.service';
import { IllustrationRenderService } from './illustration-render.service';
import { IllustrationsProcessor } from './illustrations.processor';

@Module({
  controllers: [IllustrationsController],
  providers: [IllustrationsService, IllustrationRenderService, IllustrationsProcessor],
  exports: [IllustrationsService],
})
export class IllustrationsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly processor: IllustrationsProcessor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.processor);
  }
}
