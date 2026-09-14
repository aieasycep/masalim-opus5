# Redis and object storage on a free tier

> **Read this first — what is verified here and what is not.**
>
> Everything in this document about *this repository* — commands, file paths,
> environment-variable names, what the code does — was checked against the code
> and is reliable. Every name was diffed against
> `apps/api/src/core/config/config.schema.ts`.
>
> Everything about *the hosting provider* — free-tier limits, prices, sleep and
> pause behaviour, which features are paid, quoted documentation — was written
> without access to the provider's site: this repository is built in a sandbox
> whose network policy blocks those domains, verified by a 403 on every attempt.
> Those parts come from prior knowledge, they are undated, and provider free
> tiers change often. **Check each one against the provider's current
> documentation before you depend on it**, especially anything that decides
> whether you will be charged.



Two dependencies, two very different answers.

Object storage has a good free story: the S3 adapter in `packages/storage/src/s3.ts`
works unmodified against Cloudflare R2 and against Supabase Storage's S3 endpoint. Set
four environment variables correctly and audio, illustrations and rendered PDFs all
work.

Redis does not have a good free story, and the reason is worth reading before you sign
up for anything. **BullMQ and a per-command-metered serverless Redis are the wrong shape
for each other.** An idle deploy — nobody logged in, no story being written — issues
about 170 Redis commands a minute, roughly 245,000 a day, purely to sit and wait for
work. Upstash's free allowance is consumed by an application doing nothing at all, in
somewhere between an hour and two days depending on which allowance is current. That
number is measured, not estimated; section 2 shows the measurement and the arithmetic
that explains it.

The recommendation is therefore: **use an instance-priced Redis, not a request-priced
one.** Render's free Key Value instance (which `render.yaml` already provisions) or a
Redis Cloud Essentials free database. Both bill by instance, not by command, so an idle
queue consumer costs nothing.

Everything below was checked against the code in this repository and against the
providers' documentation on 18 August 2026. Free tiers move; section 10 lists what I
could not confirm.

---

## 1. What this codebase actually asks of Redis

`REDIS_URL` is the only Redis setting in the schema
(`apps/api/src/core/config/config.schema.ts`) and it is required — the API will not boot
without it. Everything else is decided in code.

`apps/api/src/core/redis/redis.service.ts` opens connections in four roles:

| Role | Options passed to ioredis | Used by |
| --- | --- | --- |
| `client` | `maxRetriesPerRequest: 3` | Rate limiting (a Lua `EVAL`), admin session revocation, the `/health/ready` `PING` |
| `publisher` | `maxRetriesPerRequest: 3` | Job-progress fan-out (`PUBLISH` on `masalim:job-progress`) |
| `subscriber` | `maxRetriesPerRequest: 3` | Duplicated once per open SSE stream in `apps/api/src/modules/jobs/jobs.controller.ts` |
| `createQueueConnection()` | `maxRetriesPerRequest: null`, `enableReadyCheck: false` | Every BullMQ `Queue` and `Worker` |

The installed versions are `bullmq@5.81.3` and `ioredis@5.11.1`.

**`maxRetriesPerRequest: null` is not a style choice.** When BullMQ is handed an existing
ioredis instance for a blocking connection it validates the options and *throws* rather
than warns:

```js
// bullmq/dist/cjs/classes/redis-connection.js
checkBlockingOptions(msg, options, throwError = false) {
  if (this.extraOptions.blocking && options && options.maxRetriesPerRequest) {
    if (throwError) { throw new Error(msg); }
```

`this.checkBlockingOptions(deprecationMessage, this.opts, true)` — `throwError` is `true`
on the instance path, which is the path this codebase uses. If a hosted provider makes
you rewrite `RedisService` to inject different options, that setting has to survive.

There are seven queues, all created through `createQueueConnection()`: six keyed by
`AIJobType` in `apps/api/src/core/queue/queue.constants.ts` (`story-generation`,
`voice-clone`, `narration`, `illustration`, `book-render`, `print-file`) and a seventh,
`retention`, in `apps/api/src/modules/retention/`. The retention queue also installs two
BullMQ job schedulers: a five-minute pass over due deletion requests, and a nightly sweep
on `20 3 * * *` in `Europe/Istanbul`.

Whether the workers run at all is decided by `MASALIM_ROLE`, read straight from
`process.env` in `apps/api/src/core/queue/role.ts` — note that this one is *not* in the
config schema, so a typo in it fails silently rather than at boot. `worker` and `all`
start workers; anything else (including unset) does not. A free tier gives you one
always-on process, so `MASALIM_ROLE=all` is what makes the queues run, and it is also
what puts the full idle command cost of section 2 onto your one Redis.

### What is lost if Redis loses its data

This matters because the free Redis instances in section 4 do not persist to disk.

Story text, jobs and assets live in Postgres; Redis holds queue state, live progress
events and rate-limit counters. A wiped Redis therefore does not lose a story. What it
loses is any job that was queued or in flight, and the consequence is more awkward than
it sounds: `QueueService.enqueue` writes the `AIJob` row *before* it queues the work, so
those rows survive with status `QUEUED` or `PROCESSING` and nothing left to execute them.
`POST /jobs/:id/retry` only accepts jobs in status `FAILED`
(`apps/api/src/core/queue/queue.service.ts` throws `JOB_NOT_RETRYABLE` otherwise), so a
parent cannot retry a stuck job from the app; it just sits at whatever percentage it
reached. On a staging deploy the fix is to start the story again. It is a real reason not
to hand a no-persistence deploy to someone and ask them to trust it.

---

## 2. What BullMQ costs when nothing is happening

A BullMQ `Worker` does not poll on a timer, it blocks — and blocking is where the cost
comes from on a metered service.

From `bullmq/dist/cjs/classes/worker.js`:

- The worker's option defaults include `drainDelay: 5`, `stalledInterval: 30000`,
  `lockDuration: 30000`.
- Each worker opens a **second** connection: `new RedisConnection(... .duplicate({ connectionName }))`.
  Passing one ioredis client to a `Worker` therefore produces two TCP connections, not one.
- The blocking call is `bclient.bzpopmin(this.keys.marker, blockTimeout)`, and with no
  delayed job pending the timeout is `Math.max(opts.drainDelay, this.minimumBlockTimeout)`
  — five seconds.
- When a delayed job *is* pending, the timeout is capped at ten seconds
  (`maximumBlockTimeout`). The retention scheduler always has one pending, so that worker
  wakes at least every ten seconds no matter what.
- Every thirty seconds each worker also runs its stalled-jobs check, one `EVALSHA`.

### The measurement

Seven `Worker`s and seven `Queue`s, the same connection options and job options this repo
uses, against a Redis 7.0.15 with nothing enqueued and nothing connected but the workers:

| | Per minute | Per day |
| --- | --- | --- |
| Commands the client sends | **170** | **244,800** |
| — of which `BZPOPMIN` | 78 | 112,320 |
| — of which `EVALSHA` | 92 | 132,480 |
| Operations Redis executes (client commands plus everything run inside the Lua scripts) | 717 | 1,032,480 |
| Connections held open by that arrangement | 22 | — |

The arithmetic reconciles exactly, which is how you know the model is right rather than
the sample being lucky:

- six job workers blocking for 5 s → `6 × 12 = 72` `BZPOPMIN`/min
- the retention worker capped at 10 s by its pending scheduled job → `6`/min
- total 78, as measured
- each returning block is followed by one `moveToActive` script → 78 `EVALSHA`/min
- seven stalled checks every 30 s → `7 × 2 = 14` `EVALSHA`/min
- total 92, as measured

### What real work costs

Twenty jobs pushed through a queue with this repo's `DEFAULT_JOB_OPTIONS`: about **3
client commands per job** (the `add`, the `moveToActive`, the `moveToFinished`) and about
**44 server-side operations per job** once the Lua bodies are counted. A retained
completed job occupies roughly 1.2 KB.

That is the whole problem in one comparison. Generating a story costs a handful of
commands. Waiting for someone to ask for one costs a quarter of a million a day.

---

## 3. Upstash, specifically

Upstash is the usual answer for free hosted Redis, so it deserves a straight verdict
rather than a shrug.

**It will connect.** BullMQ used to detect an Upstash hostname and refuse
([issue #1087](https://github.com/taskforcesh/bullmq/issues/1087)); that check was removed
in v3 and `grep -ri upstash` finds nothing in the installed `bullmq@5.81.3`. Upstash's own
documentation now has a BullMQ integration page. TLS is on by default and cannot be
disabled, so the URL is `rediss://default:PASSWORD@HOST.upstash.io:6379`, which ioredis
handles with no code change — it sets `tls: true` when the string starts with `rediss://`
(`ioredis/built/Redis.js`, the `arg.startsWith("rediss://")` branch). Nothing in this
repository needs editing to *connect* to Upstash.

**The budget is the problem.** Sources I could reach describe the current free plan as
500,000 commands per month with 256 MB of data; older material describes 10,000 commands
per day. I could not load `upstash.com` directly to settle which is current — it is
blocked from this environment — so take both:

| Free allowance | Time to exhaust at 170 commands/min idle |
| --- | --- |
| 500,000 / month | **about 2 days** |
| 10,000 / day | **under an hour** |

The conclusion does not depend on which figure is right, which is the useful thing about
it. Upstash's own guidance says the same in gentler words: BullMQ accesses Redis
regularly even with no queue activity, and they recommend their fixed plans rather than
per-request pricing for this use case. There is a well-known bug report from a project
that put a queue on a free Upstash database and burned 10,000 commands in minutes.

This is not a defect in either product. Upstash prices per request because that suits a
serverless function that touches Redis when a request arrives. A queue consumer is the
opposite: it holds a connection open and asks "anything yet?" forever.

### Could configuration fix it?

Not enough to matter, and I have not changed anything. For the record, if you want to try:

- `apps/api/src/core/queue/worker-host.service.ts` — the `new Worker(...)` options object
  currently passes `connection` and `concurrency: 4`. Adding `drainDelay` (seconds) there
  lengthens the block and reduces `BZPOPMIN` frequency for the six job queues.
- `apps/api/src/modules/retention/retention.worker.ts` — the same for the retention
  worker, which passes `connection` and `concurrency: 1`.

The floor you can reach that way is still tens of thousands of commands a day: the
stalled-jobs check is fixed at every 30 seconds per worker (14/min for seven workers),
and the retention worker's block stays capped at ten seconds while its scheduler has a
delayed job pending. `stalledInterval` can be raised too, but it is the mechanism that
recovers a job whose worker died mid-render, so lengthening it lengthens the window in
which a parent's story is stuck. Trading a correctness property for a billing quota is
the wrong trade on a deploy whose entire purpose is to be clicked through honestly.

Two further Upstash-specific unknowns, both untestable from here: whether the concurrent
connection cap on the free plan is above the ~24 connections section 4 counts, and
whether Upstash counts each command inside a Lua script separately (BullMQ runs
everything through Lua, so if it does, multiply the figures by about four). Neither
changes the recommendation.

---

## 4. What to use instead

Both options below are priced per instance, so an idle worker costs nothing at all.

### Render Key Value (free plan)

The natural choice if the API is on Render, because `render.yaml` already declares it and
it sits on the private network — no TLS, no password, no egress.

- New instances run **Valkey 8**, a fork of Redis 7.2.4. BullMQ handles this correctly:
  its version gate returns `false` for any database type other than `redis`
  (`isRedisVersionLowerThan` in `bullmq/dist/cjs/utils/index.js`), so a Valkey instance
  passes the minimum-version check and gets the full capability set.
- Widely reported as 25 MB with 50 connections; I could not load Render's docs from here
  to confirm those two numbers. The Valkey 8 and persistence statements are from Render's
  own material.
- **No disk persistence, and data is lost on restart or upgrade.** Render may restart a
  free instance at any time. Upgrading a free instance to a paid one also loses its data.
  Re-read the end of section 1 for what that means for in-flight jobs.
- `maxmemoryPolicy` is selectable and `render.yaml` sets `noeviction`. Keep it there:
  under memory pressure an evicting policy silently deletes queued jobs, and BullMQ warns
  about exactly this at connect time (`IMPORTANT! Eviction policy is ... It should be "noeviction"`).
- URLs use `redis://` internally and `rediss://` externally; both work unchanged.

### Redis Cloud Essentials (free 30 MB)

The portable choice — use it when the API is somewhere without a bundled Redis.

- 30 MB, **30 concurrent connections**, 100 operations/second, 5 GB/month network.
- **TLS is not available on the free Essentials plan.** Paid Essentials and Pro can
  encrypt; free cannot. So the connection crosses the public internet authenticated by a
  password in cleartext. For a staging deploy with mock providers and test families that
  is a defensible trade; write it down, and do not let that database follow you to
  production.
- Idle traffic measured in section 2 is about 12 operations/second server-side, so the
  100 ops/second ceiling has headroom — but it is a ceiling a burst of jobs can touch.

### The number that decides between them: connections

Count them from the code, for `MASALIM_ROLE=all`:

| When | Connections | Where they come from |
| --- | --- | --- |
| At boot | **16** | 6 job workers × 2 (each `Worker` duplicates its client) = 12; retention queue 1 + retention worker × 2 = 3; the command client on the first `/health/ready` = 1 |
| After each job type has been enqueued once | **22** | `QueueService.queueFor()` opens one connection per `AIJobType`, lazily |
| Plus fan-out | **24** | the publisher on the first progress event, the subscriber on the first SSE stream |
| Plus each open progress stream | **+1 each** | `jobs.controller.ts` calls `this.redis.subscriber.duplicate()` per stream and quits it when the stream closes |

Against Redis Cloud's 30-connection cap that leaves about six concurrent progress
streams before new ones start failing. Against a 50-connection instance it is
comfortable. This is the constraint to watch, not memory: twenty completed jobs added
about 32 KB, so even 25 MB holds thousands of them.

### Memory and eviction, in one line

Whatever you pick, set the eviction policy to `noeviction`. A cache that drops keys under
pressure is fine; a queue that drops keys under pressure loses a family's story and tells
nobody.

---

## 5. What the storage adapter actually needs

`packages/storage/src/s3.ts` builds one `S3Client`:

```ts
this.client = new S3Client({
  region: options.region,
  credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  ...(options.endpoint ? { endpoint: options.endpoint } : {}),
  forcePathStyle: options.forcePathStyle ?? false,
});
```

and uses exactly four operations — `PutObject`, `GetObject`, `HeadObject`,
`DeleteObject` — plus presigned PUT and GET via `@aws-sdk/s3-request-presigner`. It never
sends an ACL, never lists a bucket, never uses multipart, and never touches bucket
policy. That small surface is why two different free providers work with it unchanged.

`apps/api/src/core/storage/storage.module.ts` maps the environment onto it. Every name
here exists in `config.schema.ts`; the one that catches people is `STORAGE_ACCESS_KEY`,
not `STORAGE_ACCESS_KEY_ID`.

| Variable | Default | What it does |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `local` | `local` or `s3`. `local` is refused when `APP_ENV=production` |
| `STORAGE_BUCKET` | `masalim-media` | Bucket name; also written to each `Asset` row |
| `STORAGE_REGION` | `auto` | Goes into the SigV4 signature — see below |
| `STORAGE_ACCESS_KEY` | empty | Access key id |
| `STORAGE_SECRET_KEY` | empty | Secret access key |
| `STORAGE_ENDPOINT` | unset | Custom S3 endpoint. Omit only for AWS S3 proper |
| `STORAGE_PUBLIC_URL` | unset | Base URL for objects marked `PUBLIC` — see section 6 |
| `STORAGE_FORCE_PATH_STYLE` | `true` | Bucket in the path rather than the hostname |
| `SIGNED_URL_TTL_SECONDS` | `900` | TTL for download URLs |

`STORAGE_REGION` is not decorative. The region is baked into the signature —
`X-Amz-Credential=AK/20260818/eu-central-1/s3/aws4_request` — so a wrong value produces
`403 SignatureDoesNotMatch` on every request, with no hint that the region is what is
wrong. R2 wants `auto`; Supabase wants your project's region.

The upload URL is signed with the length bound into it:

```ts
const command = new PutObjectCommand({ Bucket, Key, ContentType, ContentLength: params.sizeBytes });
const url = await getSignedUrl(this.client, command, {
  expiresIn: params.ttlSeconds,
  signableHeaders: new Set(['content-type', 'content-length']),
});
```

which produces `X-Amz-SignedHeaders=content-length;content-type;host`. The uploader must
present both headers with exactly the signed values — `packages/api-client/src/upload.ts`
spreads the returned headers into its `PUT`, and the runtime fills `content-length` in
from the body itself — so a body whose length differs from the size the client declared
when it asked for the URL is rejected by the storage host, not by the API. That is
deliberate: it stops a client asking for a URL for a 2 MB recording and then storing a
2 GB file. It also means that "the upload works from curl but fails from the app" is
nearly always a length or content-type mismatch rather than a credentials problem.

---

## 6. `STORAGE_ENDPOINT` versus `STORAGE_PUBLIC_URL`

These two are easy to swap and the symptom of swapping them is nasty: stories generate
perfectly, jobs reach `COMPLETED`, and then nothing plays. Here is the precise truth,
read out of the adapter rather than inferred from the variable names.

**`STORAGE_ENDPOINT` is both where the API uploads and where the phone downloads.**
Signed URLs are produced by the same `S3Client`, so their hostname is the endpoint's
hostname. Presigning against an R2-style endpoint with this repo's SDK version gives:

```
https://<account>.r2.cloudflarestorage.com/masalim-media/narration_audio/u1/a1.mp3?X-Amz-Algorithm=...
```

The host in that URL is `STORAGE_ENDPOINT`'s host, full stop. If the endpoint is
reachable only from inside your network, every signed URL you hand a phone is
unresolvable. This is exactly what the bundled compose file configures —
`STORAGE_ENDPOINT=http://minio:9000`, a Docker service name — and it is why that
arrangement needs a public route in front of MinIO before an app on a phone can play
anything. On a free tier, where storage is a hosted provider rather than a sidecar,
`STORAGE_ENDPOINT` is a public HTTPS hostname and this problem does not arise.

**`STORAGE_PUBLIC_URL` is only used for objects marked `PUBLIC`,** and today nothing marks
anything `PUBLIC`. `getPublicUrl()` is reached from exactly one place —
`AssetsService.signedUrlForAsset`, in the `asset.visibility === 'PUBLIC'` branch — and the
Prisma column is `visibility AssetVisibility @default(PRIVATE)` with no caller anywhere
passing `PUBLIC`. Every asset the app serves today (narration, illustrations, book
previews, print PDFs, voice previews) goes down the signed-URL path.

So:

- Setting `STORAGE_PUBLIC_URL` to a CDN hostname does **not** change where media is
  fetched from. It changes nothing at all right now.
- Leaving it unset is safe today. If something later marks an asset `PUBLIC` and it is
  still unset, the S3 driver throws `STORAGE_PUBLIC_URL is not configured; cannot build a
  public URL for this object.` — a loud failure, not a silent one.
- The comment in `.env.deploy.example` describing `STORAGE_PUBLIC_URL` as "the origin the
  *phone* fetches media from" is true only of the public path that nothing currently
  uses. For everything the app actually plays, the phone's origin is `STORAGE_ENDPOINT`.

One provider-specific trap that follows from this: **R2 presigned URLs only work on the
S3 API domain** (`<ACCOUNT_ID>.r2.cloudflarestorage.com`) and cannot be used with a custom
domain. So you cannot point `STORAGE_ENDPOINT` at a pretty `media.example.com` in front of
R2 and expect signed URLs to validate. Custom domains and `r2.dev` are for public objects,
which is the `STORAGE_PUBLIC_URL` path, which nothing uses.

---

## 7. The free storage options

### Cloudflare R2 — works with this adapter unmodified

From Cloudflare's pricing documentation: **10 GB-month of storage, 1 million Class A
operations/month, 10 million Class B operations/month, and free egress.** The free tier
applies to Standard storage only, not Infrequent Access. Class A is writes
(`PutObject`); Class B is reads (`GetObject`, `HeadObject`); deletes are free. This app's
pattern — write once, read from a phone repeatedly — sits almost entirely in the
10-million bucket, and free egress means a family replaying a bedtime story costs nothing.

- Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. A bucket created under R2's
  EU jurisdiction is reached at `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`
  instead — worth knowing because the mismatch presents as a credentials error rather
  than as a wrong hostname.
- Region: `auto`, which is the schema default already. Cloudflare aliases an empty value
  and `us-east-1` to `auto` for tools that cannot express it; anything else is rejected.
- Addressing: Cloudflare's own SDK example omits `forcePathStyle`, so the SDK default
  (virtual-hosted, `<bucket>.<account>.r2.cloudflarestorage.com`) is the documented path.
  Path-style — what `STORAGE_FORCE_PATH_STYLE=true` produces — is in wide use against R2
  and is what the smoke test in section 8 exercises, but Cloudflare's S3 compatibility
  page does not state addressing-style support either way. If the smoke test returns
  `NoSuchBucket` with path style on, set `STORAGE_FORCE_PATH_STYLE=false` and run it
  again; that is the whole fix.
- Presigned URLs: supported for GET, HEAD, PUT and DELETE, expiry from 1 second to 7 days.
  `SIGNED_URL_TTL_SECONDS` at its 900-second default is well inside that.
- The bucket stays private. Signed URLs do not need public access enabled.
- Expect to be asked for a payment method when you enable R2 even though you intend to
  stay inside the free allowance. Cloudflare's pricing page does not state a requirement
  either way and I could not reach the community threads that report it, so treat this as
  "have a card ready", not as established fact.

### Supabase Storage — also works unmodified

Free plan: **1 GB of file storage and 5 GB of egress per month**, up to two active
projects, no card required. The S3 protocol endpoint supports every operation this
adapter uses — `PutObject`, `GetObject`, `HeadObject`, `DeleteObject` are all listed as
supported — and presigned URLs work via AWS Signature Version 4, which is what
`@aws-sdk/s3-request-presigner` produces.

- Endpoint: `https://<project-ref>.storage.supabase.co/storage/v1/s3`. With
  `forcePathStyle: true` the SDK composes
  `/storage/v1/s3/<bucket>/<key>`, which is the shape Supabase expects.
- Region: your **project's** region (for example `eu-central-1`), not `auto`. This is the
  most likely thing to get wrong, and it fails as `SignatureDoesNotMatch`.
- `STORAGE_FORCE_PATH_STYLE=true` is required, not optional.
- S3 access keys are project-wide, grant full access to every bucket, and bypass row-level
  security. They belong in the API's environment and nowhere near a client.
- Not supported, and not used here: ACLs (`x-amz-acl`), object versioning, `UploadPartCopy`,
  server-side encryption options. Deleted objects are gone permanently.
- **A free Supabase project pauses after a week without API requests** and a human has to
  resume it. Storage goes down with it, so media stops resolving even if the API is
  running elsewhere. If the Postgres database is also on Supabase, one pause takes both;
  `docs/deploy/database.md` covers that side.

### Staying on local disk

`render.yaml` currently sets `STORAGE_PROVIDER=local`, which is a reasonable starting
point and worth being honest about: `LocalDiskStorageProvider` writes under
`STORAGE_LOCAL_DIR` and signs its own URLs against `API_BASE_URL` with `JWT_REFRESH_SECRET`.
On a free instance with no persistent volume, everything written disappears when the
service sleeps, restarts or redeploys. Stories keep their text; their audio and pictures
turn into rows pointing at files that no longer exist. Good enough to click through a
journey, not good enough to hand to someone for a week. `createStorageProvider` refuses
`local` outright when `APP_ENV=production`.

### Choosing

| | R2 | Supabase Storage | Local disk |
| --- | --- | --- | --- |
| Free allowance | 10 GB, 1M Class A, 10M Class B/month | 1 GB, 5 GB egress/month | The instance's disk |
| Egress | Free | 5 GB/month | N/A |
| Card required | Expect to be asked | No | No |
| Survives a redeploy | Yes | Yes | **No** |
| Goes away on its own | No | **Pauses after 7 idle days** | On every restart |
| `STORAGE_REGION` | `auto` | project region | ignored |
| Adapter changes needed | None | None | None |

Pick R2 if you want the deploy to keep working while you are not looking at it. Pick
Supabase Storage if the database is already there and you would rather have one account
than two. Pick local disk only while you are still deciding.

---

## 8. Configuring it

### Redis

```
# Render Key Value, private network — the URL comes from the instance, not from you.
REDIS_URL=redis://red-xxxxxxxxxxxxxxxxxxxx:6379

# Redis Cloud Essentials free — no TLS on this plan, so redis:// not rediss://.
REDIS_URL=redis://default:PASSWORD@redis-12345.c1.eu-central-1-1.ec2.redns.redis-cloud.com:12345
```

Set the instance's eviction policy to `noeviction` wherever that is configurable.

### Cloudflare R2

```
STORAGE_PROVIDER=s3
STORAGE_BUCKET=masalim-media
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=<R2 access key id>
STORAGE_SECRET_KEY=<R2 secret access key>
STORAGE_FORCE_PATH_STYLE=true
SIGNED_URL_TTL_SECONDS=900
```

### Supabase Storage

```
STORAGE_PROVIDER=s3
STORAGE_BUCKET=masalim-media
STORAGE_REGION=eu-central-1          # your project's region, not "auto"
STORAGE_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STORAGE_ACCESS_KEY=<S3 access key id from the project's storage settings>
STORAGE_SECRET_KEY=<S3 secret access key>
STORAGE_FORCE_PATH_STYLE=true
SIGNED_URL_TTL_SECONDS=900
```

Create the bucket before the first upload; neither the adapter nor the API creates one.
`STORAGE_PUBLIC_URL` is deliberately absent from both blocks — see section 6.

### Proving it before you wire it in

Storage misconfiguration surfaces late: the API boots happily, a story generates, and the
failure appears when a phone tries to play the audio. Ten seconds of verification is
worth the evening it saves. Save this as `storage-smoke.mjs` and run it from
`packages/storage` so the AWS SDK resolves:

```js
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand }
  from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const e = process.env;
const client = new S3Client({
  region: e.STORAGE_REGION,
  credentials: { accessKeyId: e.STORAGE_ACCESS_KEY, secretAccessKey: e.STORAGE_SECRET_KEY },
  ...(e.STORAGE_ENDPOINT ? { endpoint: e.STORAGE_ENDPOINT } : {}),
  // Same truthiness the config schema uses: 'true' or '1'.
  forcePathStyle: ['true', '1'].includes(e.STORAGE_FORCE_PATH_STYLE ?? 'true'),
});

const Bucket = e.STORAGE_BUCKET;
const Key = `narration_audio/smoke/${Date.now()}.mp3`;
const body = Buffer.from('masalim storage smoke test\n');

const uploadUrl = await getSignedUrl(
  client,
  new PutObjectCommand({ Bucket, Key, ContentType: 'audio/mpeg', ContentLength: body.byteLength }),
  { expiresIn: 900, signableHeaders: new Set(['content-type', 'content-length']) },
);
const put = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'content-type': 'audio/mpeg', 'content-length': String(body.byteLength) },
  body,
});
console.log('signed PUT  ', put.status, put.ok ? 'ok' : await put.text());

const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
console.log('HeadObject  ', head.ContentLength, 'bytes', head.ContentType);

const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: 900 });
const get = await fetch(downloadUrl);
console.log('signed GET  ', get.status, (await get.text()).trim());
console.log('phone fetches from:', new URL(downloadUrl).host);

await client.send(new DeleteObjectCommand({ Bucket, Key }));
console.log('DeleteObject ok');
```

```
cd packages/storage
STORAGE_BUCKET=... STORAGE_REGION=... STORAGE_ENDPOINT=... \
STORAGE_ACCESS_KEY=... STORAGE_SECRET_KEY=... STORAGE_FORCE_PATH_STYLE=true \
node storage-smoke.mjs
```

Reading the failures:

| What you see | What it is |
| --- | --- |
| `403 SignatureDoesNotMatch` | Wrong `STORAGE_REGION`, or the keys do not belong to this endpoint |
| `403 SignatureDoesNotMatch` only on the PUT | The `content-length`/`content-type` headers did not match what was signed |
| `404 NoSuchBucket` | Bucket does not exist, or `STORAGE_FORCE_PATH_STYLE` disagrees with the provider |
| DNS or connection refused | `STORAGE_ENDPOINT` is not publicly reachable — see section 6 |
| `phone fetches from:` prints an internal hostname | The deploy will generate stories that never play |

For Redis the equivalent check is the API's own readiness probe: `/health/ready` returns
`redis: up` with a latency, and it does it by issuing a real `PING` on the command client.

---

## 9. Checklist

- [ ] `REDIS_URL` points at an instance-priced Redis, not a per-command one
- [ ] Eviction policy is `noeviction`
- [ ] You know your Redis loses everything on restart, and you accept stuck `QUEUED` jobs
- [ ] Connection cap is above 24, with room for concurrent progress streams
- [ ] `rediss://` used wherever TLS is available; noted where it is not
- [ ] Bucket created; `STORAGE_PROVIDER=s3`
- [ ] `STORAGE_REGION` is `auto` for R2, the project region for Supabase
- [ ] `STORAGE_ENDPOINT` is a hostname a phone on mobile data can resolve
- [ ] `STORAGE_FORCE_PATH_STYLE=true`
- [ ] The smoke script's `phone fetches from:` line named a publicly reachable host
- [ ] `STORAGE_PUBLIC_URL` left unset unless something starts marking assets `PUBLIC`

---

## 10. What I could not confirm

Provider pages are split into two lists at the end of this document. The ones under
"fetched directly" were loaded and read; the rest were read only through a search index,
because `upstash.com`, `redis.io`, `render.com`, `supabase.com` and
`developers.cloudflare.com` are all blocked from the environment these notes were written
in — which is also why several Cloudflare and Supabase citations point at the docs' source
files on GitHub rather than the rendered pages. Specifically unverified:

- **Upstash's current free command allowance.** Two figures are in circulation (500,000
  per month; 10,000 per day). Both lead to the same conclusion.
- **Upstash's free concurrent-connection cap**, and whether commands inside a Lua script
  are billed individually.
- **Render Key Value free-plan numbers** — 25 MB and 50 connections are widely repeated
  but I could not read them from Render. The Valkey 8 version and the no-persistence
  behaviour *are* from Render's own material.
- **Whether Redis Cloud's free Essentials plan persists to disk.** Assume it does not.
- **Whether Cloudflare requires a payment method to enable R2.** Their pricing page is
  silent; user reports say yes.
- **Whether R2 accepts path-style addressing.** Cloudflare documents the endpoint and the
  `auto` region but not the addressing style, and their SDK example leaves
  `forcePathStyle` unset. Section 7 says which knob to flip if it turns out not to.
- **Supabase's S3 endpoint behaviour with a signed `content-length` header.** Their
  documentation lists presigned URLs and all four operations as supported but says nothing
  about that specific signed header, which is why section 8 has a smoke test.

Everything about this repository's own behaviour — connection counts, options passed,
which variable produces which URL, what BullMQ does when idle — was read from the code or
measured against a real Redis, and the measurements are reproducible with seven workers
and an empty queue.

---

## Sources

Fetched directly:

- [BullMQ issue #1087 — "Warn users that BullMQ is not compatible with Upstash"](https://github.com/taskforcesh/bullmq/issues/1087)
- [Cloudflare R2 pricing (docs source)](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/r2/pricing.mdx)
- [Cloudflare R2 presigned URLs (docs source)](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/r2/api/s3/presigned-urls.mdx)
- [Cloudflare R2 S3 API compatibility (docs source)](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/r2/api/s3/api.mdx)
- [Cloudflare R2 with the AWS SDK for JavaScript v3 (docs source)](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/r2/examples/aws/aws-sdk-js-v3.mdx)
- [Cloudflare R2 data location and jurisdictions (docs source)](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/r2/reference/data-location.mdx)
- [Supabase Storage S3 compatibility (docs source)](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/storage/s3/compatibility.mdx)
- [Supabase Storage S3 authentication (docs source)](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/storage/s3/authentication.mdx)
- [Render Key Value skill reference](https://github.com/render-oss/skills/blob/main/skills/render-keyvalue/SKILL.md)

Read through a search index only:

- [Upstash Redis pricing](https://upstash.com/pricing/redis) and [BullMQ with Upstash Redis](https://upstash.com/docs/redis/integrations/bullmq)
- [Redis Cloud Essentials plan details](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/) and [Redis Cloud TLS](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/)
- [Render Key Value docs](https://render.com/docs/key-value) and [Deploy for Free](https://render.com/docs/free)
- [Supabase pricing](https://supabase.com/pricing)
- [medusajs/admin issue #654](https://github.com/medusajs/admin/issues/654) — a queue on free Upstash, 10,000 commands in minutes

Read from this repository and its `node_modules`: `apps/api/src/core/redis/redis.service.ts`,
`apps/api/src/core/queue/`, `apps/api/src/modules/retention/`,
`apps/api/src/modules/jobs/jobs.controller.ts`, `apps/api/src/modules/assets/assets.service.ts`,
`apps/api/src/core/storage/storage.module.ts`, `apps/api/src/core/config/config.schema.ts`,
`packages/storage/src/`, `packages/api-client/src/upload.ts`, `bullmq@5.81.3`, `ioredis@5.11.1`.
