import { Module } from '@nestjs/common';
import { AssetPurgeService } from './asset-purge.service';
import { VoicePurgeService } from './voice-purge.service';
import { AccountDeletionService } from './account-deletion.service';
import { DeletionRequestService } from './deletion-request.service';
import { VoiceRetentionService } from './voice-retention.service';
import { RetentionAuditService } from './retention-audit.service';
import { RetentionQueueService } from './retention.queue';
import { RetentionWorkerService } from './retention.worker';

/**
 * Data retention and deletion.
 *
 * No controller: nothing here is triggered by a request. Deletion is asked for
 * through the users and voices endpoints, which write a DeletionRequest row;
 * this module is what makes that row mean something, and the sweep enforces the
 * retention window whether or not anyone asked.
 */
@Module({
  providers: [
    AssetPurgeService,
    VoicePurgeService,
    AccountDeletionService,
    DeletionRequestService,
    VoiceRetentionService,
    RetentionAuditService,
    RetentionQueueService,
    RetentionWorkerService,
  ],
  exports: [
    DeletionRequestService,
    VoiceRetentionService,
    VoicePurgeService,
    AssetPurgeService,
    RetentionQueueService,
  ],
})
export class RetentionModule {}
