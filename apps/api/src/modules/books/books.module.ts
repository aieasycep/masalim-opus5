import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { closeRenderer } from '@masalim/book-render';
import { JobProcessorRegistry } from '../../core/queue/job-processor.registry';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { BookRenderService } from './book-render.service';
import { BookPreviewProcessor, PrintFileProcessor } from './books.processor';

@Module({
  controllers: [BooksController],
  providers: [BooksService, BookRenderService, BookPreviewProcessor, PrintFileProcessor],
  exports: [BooksService],
})
export class BooksModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly preview: BookPreviewProcessor,
    private readonly print: PrintFileProcessor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.preview);
    this.registry.register(this.print);
  }

  /** The shared Chromium outlives individual renders, so it is closed here. */
  async onModuleDestroy(): Promise<void> {
    await closeRenderer();
  }
}
