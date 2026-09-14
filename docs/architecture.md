# Architecture

Masalım is one pnpm workspace holding three deployable applications and the
packages they share. The shape is not "a monorepo because monorepos are nice":
the mobile app and the API have to agree about limits, error codes, enum values
and message keys, and every one of those agreements is a package rather than a
convention nobody enforces.

```
apps/api        NestJS 11 — HTTP entrypoint and worker entrypoint, one module graph
apps/mobile     Expo Router (React Native) — the parent-facing app
apps/admin      Next.js App Router — the operator console (directory is still empty)
packages/*      what the three of them share
```

`apps/admin` is a reserved, currently empty workspace. Its server side already
exists: `apps/api/src/modules/admin/` serves the whole console under `/admin`,
with its own `AdminUser` table, its own token type and its own role guard. The
panel is a client of that surface, not a second backend.

## The two API processes

`apps/api` builds one Nest module graph and starts it twice.

| Entrypoint | Script | What it does |
|---|---|---|
| `src/main.ts` | `pnpm --filter @masalim/api start` | Listens on `API_PORT`, serves HTTP and SSE |
| `src/main.worker.ts` | `pnpm --filter @masalim/api start:worker` | Creates an application context, no HTTP listener |

The worker entrypoint sets `process.env.MASALIM_ROLE = 'worker'` before Nest
boots. `WorkerHostService.onApplicationBootstrap` returns immediately unless
that variable is set, so the HTTP process enqueues work and never executes it.
That single line is what keeps a burst of illustration jobs from making the API
slow to answer a parent opening the Library — and it is why "the API is up" and
"jobs are being processed" are two separate operational facts.

Both entrypoints call `loadEnvironment()` from `src/bootstrap.ts` *first*, before
`reflect-metadata` or any Nest import, because `AppConfigService` validates the
environment in its constructor: a late `.env` load would defeat the boot-time
check it exists to perform.

## Where the boundaries fall

### `@masalim/types` — the vocabulary, with no dependencies at all

`packages/types/package.json` declares no runtime dependencies at all — not even
zod — and that is the whole point. It holds enum tuples, `ERROR_CODES`, entitlement keys,
`RATE_LIMITS`, story rules and the DTO shapes the API returns. Everything else
depends on it: `@masalim/database`, `@masalim/ui`, `@masalim/localization`,
`@masalim/validation`, both apps.

If types carried Zod, every one of those would carry Zod. `@masalim/ui` is a
React Native design system that has no business shipping a validator into the
app bundle; `@masalim/database` is a Prisma client wrapper that has no business
owning request validation. Keeping the vocabulary free of runtime dependencies
is what lets it sit at the bottom of the graph without dragging anything with
it.

### `@masalim/validation` — the limits, as executable Zod

Zod schemas are runtime code, and they are the source of truth for every
boundary a parent can hit: field lengths, allowed enum members, page counts,
quantities. `packages/validation` depends on `@masalim/types` and `zod`, and
nothing else.

Both sides consume the same schema object. The API validates with
`@Body(zodBody(schema))` (`apps/api/src/core/http/zod-validation.pipe.ts`); the
mobile app resolves the same schema through `@hookform/resolvers`. A form that
accepts a 300-character hero name and an API that rejects it at 60 cannot happen,
because there is one schema and one number.

The separation also has a rule attached: a screen never hardcodes a limit. It
imports it from `@masalim/validation`, or reads it from `GET /app/config`.

### `@masalim/api-client` — the only place a URL is written

Depends on `@masalim/types` and `@masalim/validation`. It owns the typed fetch
client and the query keys, so no screen builds a path by hand and no screen
invents a response shape.

### The capability packages

`ai`, `audio`, `book-render`, `storage`, `payments`, `notifications`,
`analytics` each own one external concern behind an interface with a complete
mock. Nothing under `apps/api/src/modules/` imports a vendor SDK — see
[`providers.md`](providers.md) for the roster and the rules that keep it honest.

`packages/database` owns the Prisma schema, the migrations and two clients: a
soft-delete-filtered one and a raw one. `packages/localization` owns `tr.ts` and
`en.ts`, whose key shape is asserted identical by a test.

### Why the client never computes a price

Prices live in the `PrintProduct` table and are resolved by
`apps/api/src/modules/orders/pricing.service.ts` using `quotePrice` from
`@masalim/payments`. The client's only role is to display what the server said.

`POST /orders/quote` returns a `PriceBreakdown`. `POST /orders` then calls
`pricing.quote(...)` **again**, server-side, from the order input — it does not
trust the breakdown the client just received. A quote is therefore a display
value with no authority; the amount charged is computed at the moment of
charging, from the database, from the resolved page count, with the caller's
entitlements applied. A client that computed prices would be a client that could
be edited into a discount.

The same reasoning runs through the rest of the app: quotas are consumed by
`EntitlementsService.consumeQuota` before a row is created, rate limits are
enforced in the service, and premium features are shown locked rather than
hidden. The client displays boundaries; the server *is* the boundary.

## The request path

Express-level middleware is installed in `src/create-app.ts`, in an order that
matters:

1. **`helmet`** with CSP disabled — this API serves JSON and signed media, never
   HTML, so a CSP would only fight the Swagger UI.
2. **CORS** from `CORS_ORIGINS`, exposing `X-Request-Id` and `Idempotent-Replay`.
3. **`raw({ type: '*/*', limit: '400mb' })` on `/uploads/local`**, registered
   before the JSON parser, because the local-disk storage driver receives a
   binary `PUT`.
4. **`json({ limit: '2mb' })` with a `verify` hook** that keeps the original
   buffer on `request.rawBody`. Store webhook signatures are computed over exact
   bytes; parsing and re-serialising changes key order and the signature never
   verifies again.
5. **`trust proxy = 1`** — rate limiting and IP hashing need the real client
   address from `X-Forwarded-For`.

Then, per request, inside Nest (`src/app.module.ts`):

| Stage | Class | Effect |
|---|---|---|
| Middleware | `RequestContextMiddleware` | Assigns or accepts a request id; sets `X-Request-Id` |
| Guard 1 | `JwtAuthGuard` | Verifies the bearer token, then loads the user |
| Guard 2 | `EntitlementGuard` | Enforces `@RequiresEntitlement(...)` |
| Interceptor 1 | `LoggingInterceptor` | One structured line per completed request |
| Interceptor 2 | `IdempotencyInterceptor` | Replays a stored response for a repeated key |
| Pipe | `zodBody(schema)` | Validates the body against the shared schema |
| Filter | `AppExceptionFilter` | Renders every thrown value as one error shape |

Three details in that table are load-bearing.

**Authentication fails closed.** `JwtAuthGuard` is a global guard; a route is
protected unless it is decorated `@Public()`. Forgetting a decorator exposes
nothing. And a valid signature is not enough: the guard re-reads the user on
every request and rejects a deleted account with `ACCOUNT_DELETED`, because a
JWT stays cryptographically valid long after the row it names is gone.

**Guard order is the reason the entitlement check works.** Global guards run in
registration order, so `EntitlementGuard` can read `request.user` that
`JwtAuthGuard` just set.

**Rate limiting is not in this table.** It is not a guard. `RateLimitService`
is called explicitly from the services that need it — `stories.service.ts`
enforces the hourly and daily story buckets together, `auth.service.ts` keys on
IP as well as user — because the right bucket depends on what the handler is
about to do, and because a service that decides not to act can `refund()` the
token it took. Buckets and windows come from `RATE_LIMITS` in
`@masalim/types`; the counter is an `INCR` + conditional `EXPIRE` pair run as one
Lua script, so a burst cannot leave a counter without a TTL and lock a parent
out permanently.

Every failure leaves as `{ error: { code, message, requestId } }`. The filter
maps `AppError`, Prisma `P2002`/`P2025`, any `HttpException` and anything else
into that shape, logs the full detail keyed by the same `requestId` the parent
was shown, and refuses to describe an unexpected throw to the client.

## How long-running work becomes a job

Anything that calls an AI provider is asynchronous, because the honest range for
a story with twelve illustrations and narrated audio is tens of seconds to
minutes, and an HTTP request that long is a request that times out on a phone on
mobile data.

The pattern, using story generation as the example
(`apps/api/src/modules/stories/stories.service.ts`):

1. **Everything that could reject runs first** — rate limits, ownership checks
   via `PolicyService`, narrator entitlement, then `consumeQuota`. A parent who
   has hit their monthly limit must not end up with a stranded `DRAFT` in their
   library.
2. **The domain row is created** (`Story`, status `DRAFT`).
3. **`QueueService.enqueue` writes the `AIJob` row before touching Redis.** The
   client always has something to poll, even if Redis is briefly unavailable. If
   the BullMQ `add` then fails, the row is marked `FAILED` with
   `SERVICE_UNAVAILABLE` — a job that exists and failed beats a request that
   appears to have vanished.
4. **The response carries both the entity and the job DTO**, so the client can
   start watching immediately.

`AIJob.idempotencyKey` is unique, and `enqueue` returns the existing row when the
key is reused. A double-tap costs one story, not two.

### The queues

One BullMQ queue per job type (`core/queue/queue.constants.ts`), so a slow
illustration run cannot starve narration:

| `AIJobType` | Queue | Processor |
|---|---|---|
| `STORY_GENERATION` | `story-generation` | `modules/stories/story-generation.processor.ts` |
| `VOICE_CLONE` | `voice-clone` | `modules/voices/voice-clone.processor.ts` |
| `NARRATION_GENERATION` | `narration` | `modules/narration/narration.processor.ts` |
| `ILLUSTRATION_GENERATION` | `illustration` | `modules/illustrations/illustrations.processor.ts` |
| `BOOK_RENDER` | `book-render` | `modules/books/books.processor.ts` |
| `PRINT_FILE_GENERATION` | `print-file` | `modules/books/books.processor.ts` |

Feature modules hand their processors to `JobProcessorRegistry` during
`onModuleInit`; `WorkerHostService` reads the registry in
`onApplicationBootstrap`, which Nest guarantees runs later. A registry rather
than a multi-provider token, because Nest resolves one provider per token and
several modules contributing to the same one would silently overwrite each other
— leaving a queue with no consumer and jobs that simply sit there.

Retention has its own queue outside this table; see
[`operations.md`](operations.md).

### Progress that cannot lie

A `JobProcessor` declares `totalSteps`. The runner passes a `JobStepReporter`,
and `JobProgressService` computes `progress` as `completedSteps / totalSteps`.
Nothing in the pipeline can invent a percentage, and `markCompleted` forces
`completedSteps` up to the total so a client rendering "4 / 12 görsel" never
freezes one step short.

Each step key is a localisation key, never raw text — the server does not write
Turkish into a progress bar, it names a message the client translates.

Progress is written to the database first, then published to the Redis channel
`masalim:job-progress`. A client watches `GET /jobs/:id/stream` (SSE) and falls
back to `GET /jobs/:id`. The stream checks ownership before it opens and filters
every published event by user id, so subscribing can never become a way to watch
another family's generation; a dropped publish is cosmetic, because the database
already holds the truth.

### Failure

`DEFAULT_JOB_OPTIONS` allows three attempts with exponential backoff from four
seconds. `WorkerHostService.run` then makes one distinction that matters: an
`AppError` whose mapped status is below 500 is a verdict, not a hiccup. An
unsuitable prompt or a missing story will fail identically on every attempt, so
it is thrown as BullMQ's `UnrecoverableError` and recorded immediately. Anything
else is retried, and the `AIJob` row is only marked `FAILED` on the final
attempt — otherwise the row would flash `FAILED` between retries and the app
would tell a parent their story was lost while it was still being written.

`POST /jobs/:id/retry` re-runs a `FAILED` job on the same row, preserving its
history and attempt count.
