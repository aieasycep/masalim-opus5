import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { JobProgressService } from './job-progress.service';
import { WorkerHostService } from './worker-host.service';

@Global()
@Module({
  providers: [QueueService, JobProgressService, WorkerHostService],
  exports: [QueueService, JobProgressService, WorkerHostService],
})
export class QueueModule {}
