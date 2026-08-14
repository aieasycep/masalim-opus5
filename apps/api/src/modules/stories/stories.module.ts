import { Module, type OnModuleInit } from '@nestjs/common';
import { JobProcessorRegistry } from '../../core/queue/job-processor.registry';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { StoryGenerationService } from './story-generation.service';
import { StoryGenerationProcessor } from './story-generation.processor';

@Module({
  controllers: [StoriesController],
  providers: [StoriesService, StoryGenerationService, StoryGenerationProcessor],
  exports: [StoriesService, StoryGenerationService],
})
export class StoriesModule implements OnModuleInit {
  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly processor: StoryGenerationProcessor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.processor);
  }
}
