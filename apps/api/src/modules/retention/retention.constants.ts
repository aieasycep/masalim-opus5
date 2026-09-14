import type { DeletionRequestStatus, OrderStatus } from '@masalim/database';

/**
 * Its own queue rather than a seventh entry in QUEUE_NAMES: those queues are
 * keyed by AIJobType and carry a user-visible AIJob row with a progress bar.
 * Retention work has no owner watching it and no percentage worth showing.
 */
export const RETENTION_QUEUE_NAME = 'retention';

export const RETENTION_JOBS = {
  /** Executes DeletionRequest rows whose grace period has elapsed. */
  DELETION_REQUESTS: 'deletion-requests',
  /** Enforces the published retention windows whether or not anyone asked. */
  RETENTION_SWEEP: 'retention-sweep',
} as const;

export type RetentionJobName = (typeof RETENTION_JOBS)[keyof typeof RETENTION_JOBS];

export const RETENTION_JOB_NAMES: readonly RetentionJobName[] = Object.values(RETENTION_JOBS);

export function isRetentionJobName(name: string): name is RetentionJobName {
  return (RETENTION_JOB_NAMES as readonly string[]).includes(name);
}

/**
 * Actions written to AuditLog with `actorType: SYSTEM`.
 *
 * Dotted and stable: an admin looking for why a family's recording disappeared
 * has to be able to filter on the action, not read prose.
 */
export const RETENTION_AUDIT_ACTIONS = {
  ACCOUNT_PURGED: 'retention.account.purged',
  ACCOUNT_DEFERRED: 'retention.account.deferred',
  VOICE_PROFILE_PURGED: 'retention.voiceProfile.purged',
  RAW_RECORDING_EXPIRED: 'retention.voiceRecording.expired',
  ABANDONED_UPLOADS_PURGED: 'retention.upload.abandoned',
  DELETION_FAILED: 'retention.deletion.failed',
} as const;

export const AUDIT_SUBJECTS = {
  USER: 'user',
  VOICE_PROFILE: 'voiceProfile',
  DELETION_REQUEST: 'deletionRequest',
  SWEEP: 'retentionSweep',
} as const;

/** How often the queue looks for deletion requests that have come due. */
export const DELETION_SCAN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The nightly sweep runs in Istanbul time.
 *
 * Not because the cutoff is timezone-sensitive — it is computed from the window
 * in seconds — but so an operator reading the audit trail sees the purge land in
 * the small hours of the market the app serves rather than mid-evening.
 */
export const RETENTION_SWEEP_CRON = '20 3 * * *';
export const RETENTION_SWEEP_TIMEZONE = 'Europe/Istanbul';

/** Requests handled per scan; keeps one pass bounded when a backlog builds. */
export const DELETION_BATCH_SIZE = 25;

/** Voice profiles and assets examined per sweep pass. */
export const SWEEP_BATCH_SIZE = 200;

/**
 * A request left PROCESSING for longer than this is assumed to belong to a
 * worker that died mid-purge and is reclaimed. Every step is idempotent, so
 * re-running one converges rather than double-deleting.
 */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

/** How long a failed request waits before the next attempt. */
export const DELETION_RETRY_DELAY_MS = 15 * 60 * 1000;

/** How long a deferred request waits for an order to reach a terminal state. */
export const DELETION_DEFER_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * A signed upload URL that was never confirmed leaves a row with no
 * `uploadedAt`. The object may still have landed in the bucket, so the row is
 * swept rather than assumed harmless — the grace is generous enough that a slow
 * phone connection finishing an upload is never mistaken for an abandoned one.
 */
export const ABANDONED_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Order states that still need the account's data.
 *
 * A printed book that is paid for and in production has to be produced and
 * shipped; erasing the family's address and the book's pages mid-flight would
 * turn a deletion request into a lost order.
 */
export const NON_TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'IN_PRODUCTION',
  'SHIPPED',
];

/** Statuses a scan may pick up. */
export const CLAIMABLE_STATUSES: readonly DeletionRequestStatus[] = ['SCHEDULED', 'PROCESSING'];
