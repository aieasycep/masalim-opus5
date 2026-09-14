import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { JobProgressService } from './job-progress.service';
import { JobProcessorRegistry } from './job-processor.registry';
import { WorkerHostService } from './worker-host.service';

@Global()
@Module({
  providers: [QueueService, JobProgressService, JobProcessorRegistry, WorkerHostService],
  exports: [QueueService, JobProgressService, JobProcessorRegistry, WorkerHostService],
})
export class QueueModule {}
