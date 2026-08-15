# Operations

This is the service once it is live: what to look at, what the queues mean when
they stop moving, how to read a failure, and which of the promises made to
parents are kept by a background process rather than by a screen.

Two facts frame everything else. The API and the worker are separate processes
from the same build, and only the worker runs queue consumers. So "the API is
healthy" and "work is being done" are independent questions, and most incidents
here are one being true while the other is not.

## Health endpoints

`apps/api/src/modules/health/health.controller.ts`, both `@Public()`.

| Route | Cost | Body |
|---|---|---|
| `GET /health` | none — no I/O at all | `{ "status": "ok" }` |
| `GET /health/ready` | one `SELECT 1` and one Redis `PING`, each timed | `{ status, environment, checks }` |

Use `/health` for the liveness probe; it touches nothing, so it can be polled
tightly and it answers the only question liveness should ask — is this process
still serving.

`/health/ready` reports each dependency as `up` or `down` with a `latencyMs`, and
rolls them up into `status: 'ok' | 'degraded'`.

**It always returns HTTP 200, including when it is degraded.** The controller
returns a plain object and never sets a status code. A load balancer configured
to look only at the status code will keep sending traffic to a replica that has
lost its database. Configure the readiness check to match on the body — either
`.status == "ok"` or `.checks.database.status == "up"` — or put a check in front
that does.

There is no health endpoint on the worker: it has no HTTP listener. Its liveness
signal is its startup log (`worker listening`, one line per queue) and, more
usefully, the rate at which `AIJob` rows leave `QUEUED`.

## The queues

Six queues carry user-visible AI work, one per `AIJobType`
(`core/queue/queue.constants.ts`), plus one for retention. One queue per type so
a slow illustration run cannot starve narration.

| Queue | Job type | Backed up means |
|---|---|---|
| `story-generation` | `STORY_GENERATION` | Nobody is getting a new story; the most visible failure there is |
| `voice-clone` | `VOICE_CLONE` | Enrolments stall at the end of the Voice Studio flow |
| `narration` | `NARRATION_GENERATION` | Stories exist but cannot be listened to |
| `illustration` | `ILLUSTRATION_GENERATION` | Storybooks stay text; usually the first queue to feel a provider slowdown |
| `book-render` | `BOOK_RENDER` | Digital previews stall — Chromium-bound, not provider-bound |
| `print-file` | `PRINT_FILE_GENERATION` | Paid orders cannot be sent to production |
| `retention` | — | Deletions and expiries are not happening (see below) |

Each worker process runs one BullMQ `Worker` per registered processor with
`concurrency: 4`; the retention worker runs at `concurrency: 1`. There is no
per-queue concurrency setting — **the unit of scaling is the worker process**.
Two worker replicas mean eight concurrent illustration jobs.

### When a queue backs up

Work through it in this order.

1. **Is a worker running at all?** The single most common cause is a deployment
   where only the API process was rolled. Look for `worker listening` in the
   startup logs; check that `MASALIM_ROLE=worker` is set on that process.
2. **Are jobs stuck at `QUEUED` or churning through `PROCESSING`?** In the
   database: `AIJob` rows with `status='QUEUED'` and `startedAt IS NULL` were
   never picked up (worker or Redis problem). Rows moving to `PROCESSING` and
   back with a rising `attempts` are a provider problem, not a capacity one. The
   `(status, type)` index exists for exactly this query.
3. **Is it the provider?** `AIUsageLog` carries one row per provider call with
   `provider`, `model`, `operation`, `success` and `latencyMs`. A spike of
   `success = false` for one provider, or a latency shift, tells you whether to
   scale workers or wait out a vendor.
4. **Is it capacity?** If jobs complete normally but the backlog grows, add
   worker replicas. Nothing in the queue configuration needs to change.

A stalled queue is not silent to users: the mobile app shows a real percentage
derived from `completedSteps / totalSteps`, so a job that is not progressing
looks exactly like what it is.

Retries are three attempts with exponential backoff from four seconds. Redis
keeps at most 1000 completed jobs and none older than 24 hours; failed jobs are
kept for seven days. The `AIJob` row outlives both — Redis is the transport,
PostgreSQL is the record.

## Reading an AIJob failure

One row tells the whole story. `AIJob` (`packages/database/prisma/schema.prisma`):

| Column | What it tells you |
|---|---|
| `status` | `QUEUED` → `PROCESSING` → `COMPLETED` / `FAILED` |
| `errorCode` | A stable `ERROR_CODES` value — the same code the client mapped to Turkish copy |
| `errorMessage` | Diagnostic text, truncated to 1000 characters |
| `attempts` / `maxAttempts` | How many runs happened out of three |
| `currentStepKey` | The localisation key of the step it died on — where in the pipeline |
| `completedSteps` / `totalSteps` | How far it got |
| `type`, `entityType`, `entityId` | Which story, voice or book |
| `idempotencyKey` | Unique; the reason a double-tap produced one job |

The interpretation rule is in `core/queue/worker-host.service.ts`: a row is
marked `FAILED` either on the final attempt **or** immediately when the error is
non-retryable. An `AppError` whose mapped status is below 500 is treated as a
verdict — an unsuitable prompt or a missing story fails identically every time —
and is thrown as BullMQ's `UnrecoverableError`. So:

- `status='FAILED'` with `attempts=1` → a domain refusal. Read `errorCode`; there
  is nothing to retry and retrying will not help.
- `status='FAILED'` with `attempts=3` → three genuine failures. Usually a
  provider outage, a timeout, or exhausted credit.
- `status='PROCESSING'` with a stale `updatedAt` → the worker died mid-job. BullMQ
  will stall-recover it; if the queue is not being consumed at all, the row stays
  as it is until a worker returns.

For the full context, correlate on `jobId`: the worker logs every attempt through
a child logger carrying `jobId`, `type` and `userId`, with `job attempt failed`
at `warn` and the final `job failed` at `error`.

`POST /jobs/:id/retry` re-runs a `FAILED` job on the same row — progress and
error fields are reset, `attempts` and the row's history are kept, and it is
re-added under a fresh BullMQ id (`<jobId>:retry:<n>`, because the previous id is
retained in the failed set). It refuses anything that is not `FAILED` with
`JOB_NOT_RETRYABLE`.

For a user-reported failure that never reached a job, the entry point is the
`requestId`: it is in the error body the parent saw, in the `X-Request-Id`
response header and on every log line for that request.

## Data retention and deletion

These are obligations, not features. The app tells parents what happens to their
data, and `apps/api/src/modules/retention/` is what makes those sentences true.
All of it runs in the worker process.

### What has been promised

| Promise | Where it is made | Who keeps it |
|---|---|---|
| A cloned voice can be deleted, here and at the provider | `DELETE /voices/:id` | Synchronous, in the request |
| An account can be permanently deleted | `POST /users/me/deletion-request` | `DeletionRequest`, executed after a 7-day grace period |
| The raw enrolment recording is kept only N days | `GET /app/config` → `voiceRawRetentionDays`, from `VOICE_RAW_RETENTION_DAYS` | The nightly sweep |
| Deletion status is visible, not a flag flip | `GET /users/me/deletion-requests` | The `DeletionRequest` row itself |

`DELETE /voices/:id` deletes at the provider **first** and only then removes the
local assets; if the provider call fails the profile is restored to its previous
status and the caller gets `SERVICE_UNAVAILABLE`. A local row deleted while the
clone still exists at ElevenLabs would be the one failure mode that looks like
success.

Account deletion soft-deletes the `User` row and revokes every live refresh token
in one transaction with the `DeletionRequest` — so the app stops working for that
parent at once — and the irreversible purge follows after the grace period,
`DELETION_GRACE_DAYS = 7` in `modules/users/users.service.ts`. Asking twice
returns the existing request rather than creating a second one. `VoiceConsent`
outlives the profile deliberately: deleting a clone must not erase the record
that the recording was ever authorised.

### The two scheduled passes

`RetentionQueueService` installs both as BullMQ job schedulers under stable ids,
so several replicas booting at once converge on one timer rather than one each.

| Pass | Cadence | What it does |
|---|---|---|
| `deletion-requests` | every 5 minutes | Claims due `DeletionRequest` rows and executes them |
| `retention-sweep` | `20 3 * * *`, `Europe/Istanbul` | Purges expired raw recordings and abandoned uploads |

The sweep runs in Istanbul time not because the cutoff is timezone-sensitive —
it is computed from a window in seconds — but so an operator reading the audit
trail sees purges land in the small hours of the market the app serves.

Behaviour worth knowing before you are paged about it:

- **Deletion is a scan, not an enqueue.** The `DeletionRequest` row *is* the
  queue. A worker that dies mid-purge, a Redis flush, or a request written by a
  process that never enqueued anything all recover on the next pass. Every step
  underneath is idempotent.
- **Rows left `PROCESSING` for over 30 minutes are reclaimed** (`STALE_CLAIM_MS`).
- **A failed request retries after 15 minutes**; a request deferred because the
  account has a live order retries after 24 hours.
- **Orders defer a purge.** An account with an order in `PENDING_PAYMENT`, `PAID`,
  `IN_PRODUCTION` or `SHIPPED` is not purged — erasing the address and the book's
  pages mid-flight would turn a deletion request into a lost order. The request
  stays open and re-checks daily; expect `retention.account.deferred` rows in the
  audit log rather than an error.
- **Objects go before rows.** `AssetPurgeService` deletes the stored object and
  only marks the row once storage confirms. A failure leaves the row untouched so
  the next pass retries, rather than leaving a recording in the bucket with
  nothing left to find it by.
- **Shortening the window applies retroactively.** The sweep purges a recording
  whose `rawRetentionUntil` has passed *or* whose asset is older than the window
  currently configured. Lowering `VOICE_RAW_RETENTION_DAYS` therefore also
  catches parents who enrolled before the change.
- **One unreachable object does not block the pass.** It is skipped for the rest
  of the run, counted in `failed`, and retried tomorrow.

### The operator's obligations

1. **Make sure a worker is running.** Everything above is worker-only. An
   API-only deployment keeps accepting deletion requests and stops honouring
   them. Confirm `retention worker listening` and `retention schedules
   registered` appear in the worker's startup log after every deploy.
2. **Watch the `retention` queue for failures.** A failed pass logs `retention
   pass failed`; retention jobs are configured with `attempts: 1` on purpose —
   they are cheap to repeat on the next tick and expensive to run twice
   concurrently — so a failure is a thing to notice, not a thing that retries
   itself in seconds.
3. **Treat a rising count of open `DeletionRequest` rows as an incident.** Query
   for `status IN ('SCHEDULED','PROCESSING') AND scheduledFor < now()`; the
   `(status, scheduledFor)` index is there for it. `errorMessage` carries the
   diagnostic — a code plus context (`ORDER_IN_PROGRESS: 2 order(s) still in
   flight`, `MISSING_SUBJECT: …`) — while `reason` holds whatever the parent
   typed when they asked, and is never overwritten by the worker.
4. **Do not change `VOICE_RAW_RETENTION_DAYS` casually.** It is published to
   every client through `GET /app/config`; it is a number parents were shown.
5. **Prune `idempotency_records` yourself.** Stored responses expire after 24
   hours, but expiry is only applied lazily when the same key is presented again.
   Nothing sweeps the table; the `expiresAt` index exists so a periodic
   `DELETE FROM idempotency_records WHERE "expiresAt" < now()` is cheap.

## What must be audited

`AuditLog` is the accountability half of everything irreversible. It has **no
foreign key to `User`** on purpose, so a record outlives the account it
describes; `adminUserId` is `SetNull`, so it outlives an operator leaving too.
Actions are dotted, stable strings — the trail is only searchable if they never
drift.

**System actions** (`actorType = SYSTEM`), from `retention.constants.ts`:

`retention.account.purged`, `retention.account.deferred`,
`retention.voiceProfile.purged`, `retention.voiceRecording.expired`,
`retention.upload.abandoned`, `retention.deletion.failed`.

Each carries primitive-only metadata — counts, byte totals, the request id, the
user id — so a row is readable without a decoder. The audit row is written
*after* the objects are gone and *before* the request is marked complete: a crash
between the two duplicates an audit row on retry, which is harmless in an
append-only log, where the other ordering would lose the record of a purge that
really happened.

**Admin actions** (`actorType = ADMIN`), from `admin/admin-audit.service.ts`:

`admin.auth.login`, `admin.auth.login_failed`, `admin.auth.logout`,
`admin.moderation.approve`, `admin.moderation.reject`,
`admin.moderation.subject.view`, `admin.order.view`,
`admin.order.status.advance`, `admin.order.tracking.attach`, `admin.user.view`,
`admin.user.deletion_requests.view`, `admin.feature_flag.toggle`.

Every mutating admin route writes one, sharing a transaction with the change
wherever both can, so the trail cannot silently disagree with what happened.
Reads are audited too when they reveal something belonging to a family rather
than to the service: a story's text behind a moderation record, an order's
shipping address, an account's details. Everything else on that surface —
queues, counts, lists — is built from aggregates and identifiers, so operating
the service never becomes reading bedtime stories over families' shoulders.

Rows carry `ipHash` and `userAgent` rather than a raw address.

Failed admin sign-ins are audited with a null actor, which is what makes
credential-stuffing against the console visible.

## Everyday signals

**The dashboard.** `GET /admin/dashboard` (`SUPPORT`, `OPERATIONS` and `ADMIN`)
returns the numbers a shift opens on, computed over the operating day in
`Europe/Istanbul`: `storiesGeneratedToday`, `storiesFailedToday`,
`ordersAwaitingFulfilment`, `moderationQueueDepth`, `activeSubscriptions`,
`newUsersToday`, `aiSpendTodayMicros` (a string — micros are a `BigInt` and would
not survive JSON as a number), `aiCallsToday` and `aiFailuresToday`. Aggregates
only; there is no drill-through from here into a family's library.

**AI spend.** `AIUsageLog` records provider, model, operation, tokens or
characters or images, latency and `estimatedCostMicros` per call, attributable
per user and per job. This is the table that turns AI cost from a monthly
surprise into a daily number.

**Rate limiting.** Counters live in Redis under `ratelimit:<bucket>:<subject>`,
with buckets and windows defined by `RATE_LIMITS` in `@masalim/types`. A user
complaining they are locked out can be checked directly there; the TTL on the key
is the answer to "when does it clear".

**Moderation.** `moderationQueueDepth` counts records still awaiting a human
decision; the queue itself is `GET /admin/moderation/queue`. Depth that only
grows means nobody is reviewing. Reading the content behind a queued record is a
separate, audited route — reviewing is deliberately not free.

**Logs.** Pino, JSON in every environment except local development, with
`env` on every line and request-scoped `requestId` and `userId` on request lines.
The redaction list in `core/logger/logger.service.ts` strips authorization
headers, passwords, tokens, card fields and — importantly — signed URLs, whose
query strings are bearer credentials for private media. Add to that list before
adding a field that might carry a secret, not after.
