import { Injectable } from '@nestjs/common';
import type { AIJobType } from '@masalim/types';
import type { JobProcessor } from './queue.constants';

/**
 * Where feature modules hand their processors to the worker.
 *
 * A registry rather than a multi-provider token: Nest resolves one provider per
 * token, so several modules contributing to the same token would silently
 * overwrite each other and a queue would end up with no consumer at all. Modules
 * register during `onModuleInit`; the worker reads the registry in
 * `onApplicationBootstrap`, which Nest guarantees runs after every module has
 * initialised.
 */
@Injectable()
export class JobProcessorRegistry {
  private readonly processors = new Map<AIJobType, JobProcessor>();

  register(processor: JobProcessor): void {
    const existing = this.processors.get(processor.type);
    if (existing && existing !== processor) {
      throw new Error(`Two processors registered for job type ${processor.type}`);
    }
    this.processors.set(processor.type, processor);
  }

  all(): JobProcessor[] {
    return [...this.processors.values()];
  }
}
