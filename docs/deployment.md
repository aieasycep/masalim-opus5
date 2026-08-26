# Deployment

Everything below is the same repository in three postures: a laptop with no
credentials, CI, and production. What changes between them is the environment,
not the code — and the environment is validated at boot, so a wrong posture
fails immediately instead of degrading quietly.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22+ | `engines` in the root `package.json` |
| pnpm | 10+ | Pinned as `pnpm@10.33.0` via `packageManager` |
| PostgreSQL | 16 | Prisma target; `docker-compose.yml` runs `postgres:16-alpine` |
| Redis | 7 | BullMQ queues, rate limiting, job progress pub/sub |
| Docker | optional | `pnpm infra:up` uses it when a daemon is reachable |
| Chromium | for book rendering | `@masalim/book-render` drives Playwright |

Two things you do **not** need to install. `ffmpeg` and `ffprobe` come from npm
(`ffmpeg-static`, `ffprobe-static`, resolved in `packages/audio/src/ffmpeg.ts`),
deliberately, so a narration cannot fail because a base image shipped without
them. And no provider credentials: with `.env.example` copied as-is, every
provider resolves to a complete mock and all three critical journeys run offline.

## Local development

```bash
pnpm install
cp .env.example .env

pnpm infra:up          # PostgreSQL + Redis (+ MinIO when Docker is available)
pnpm db:migrate        # prisma migrate dev
pnpm db:seed           # reference data, idempotent
```

`scripts/dev-infra.sh` prefers Docker Compose and falls back to natively
installed PostgreSQL and Redis when the Docker CLI exists but no daemon answers
— it initialises a cluster under `.dev-infra/` and creates `masalim`,
`masalim_shadow` and `masalim_test`. Either path leaves the connection strings in
`.env.example` working. In the native fallback there is no MinIO, so object
storage stays on the local-disk driver.

Then, each in its own terminal:

```bash
pnpm dev:api      # http://localhost:3000, OpenAPI at /docs
pnpm dev:worker   # the job worker — nothing generates without it
pnpm dev:admin    # http://localhost:3001
pnpm dev:mobile   # Expo
```

`pnpm dev:worker` is not optional. The HTTP process refuses to run job
processors (see [`architecture.md`](architecture.md)), so with only the API up
every generation sits at `QUEUED` forever and the app shows a progress bar that
never moves.

Checks, all Turborepo tasks: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:e2e`. The last needs a live PostgreSQL and Redis.

## Environment variables

The schema is `apps/api/src/core/config/config.schema.ts`. It is parsed once, in
the `AppConfigService` constructor, and a failure prints every offending key
before the process exits. `.env.example` documents the same surface plus the
variables belonging to the other workspaces.

`bootstrap.ts` loads the repository-root `.env` and then `apps/api/.env` as an
override. Neither file has to exist: in a container, real environment variables
are all that is required.

One monorepo-specific trap: **Turborepo runs tasks in a filtered environment.**
A variable not listed in `globalEnv` in `turbo.json` is simply absent from the
child process, with no warning. If you add a variable, add it there too.

### Required, with no default

Four keys. The process will not start without them.

| Variable | Constraint |
|---|---|
| `DATABASE_URL` | non-empty |
| `REDIS_URL` | non-empty |
| `JWT_ACCESS_SECRET` | at least 32 characters |
| `JWT_REFRESH_SECRET` | at least 32 characters |

Generate the secrets with `openssl rand -base64 48`. In production they are
additionally rejected if they still contain `dev-only` or `change-me`, so an
`.env.example` value copied into a deployment fails loudly rather than working
badly.

### Runtime

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `APP_ENV` | `development` | `development` \| `staging` \| `production` — this is the one the production guards read |
| `API_PORT` | `3000` | |
| `API_BASE_URL` | `http://localhost:3000` | Must be a valid URL |
| `CORS_ORIGINS` | `''` | Comma-separated. **Empty means every origin is reflected** — set it in production |
| `LOG_LEVEL` | `info` | `trace` also turns on Prisma query logging |

`APP_ENV` and `NODE_ENV` are separate on purpose: a staging deployment runs
`NODE_ENV=production` for Node's sake while `APP_ENV=staging` keeps the
production-only refusals off.

### Auth and sign-in

| Variable | Default | Required when |
|---|---|---|
| `JWT_ACCESS_TTL` | `900` | |
| `JWT_REFRESH_TTL` | `2592000` | |
| `APPLE_BUNDLE_ID` | `com.masalim.app` | |
| `APPLE_SERVICE_ID` | — | Apple sign-in |
| `GOOGLE_IOS_CLIENT_ID` | — | Google sign-in on iOS |
| `GOOGLE_ANDROID_CLIENT_ID` | — | Google sign-in on Android |
| `GOOGLE_WEB_CLIENT_ID` | — | Google sign-in from the web |

The admin console has no secret of its own in the API: `AdminTokenService`
derives its signing key from `JWT_ACCESS_SECRET` by SHA-256 rather than reusing
it, and admin tokens carry `typ: admin` and the `masalim-admin` audience, both
verified. Rotating `JWT_ACCESS_SECRET` therefore invalidates admin sessions too.

### Storage

| Variable | Default | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | `local` | `local` writes to `STORAGE_LOCAL_DIR`; **rejected when `APP_ENV=production`** |
| `STORAGE_BUCKET` | `masalim-media` | |
| `STORAGE_REGION` | `auto` | `auto` suits Cloudflare R2 |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | `''` | Required in practice for `s3` |
| `STORAGE_ENDPOINT` | — | R2 account endpoint, or `http://localhost:9000` for MinIO |
| `STORAGE_PUBLIC_URL` | — | Needed to build URLs for public objects; the S3 driver throws without it |
| `STORAGE_FORCE_PATH_STYLE` | `true` | |
| `STORAGE_LOCAL_DIR` | `.storage` | |
| `SIGNED_URL_TTL_SECONDS` | `900` | Default lifetime of a signed media URL |

### Providers

Every provider variable has a mock default, so this whole block is optional
locally and mandatory in production. The selector and its credentials:

| Selector | Values | Credentials it makes required in production |
|---|---|---|
| `AI_PROVIDER` | `mock` \| `anthropic` \| `openai` | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |
| `MODERATION_PROVIDER` | `mock` \| `openai` | `OPENAI_API_KEY` |
| `IMAGE_PROVIDER` | `mock` \| `openai` | `OPENAI_API_KEY` |
| `TTS_PROVIDER` | `mock` \| `elevenlabs` | `ELEVENLABS_API_KEY` |
| `VOICE_CLONE_PROVIDER` | `mock` \| `elevenlabs` | `ELEVENLABS_API_KEY` |
| `PAYMENT_PROVIDER` | `mock` \| `iyzico` | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` |
| `SUBSCRIPTION_PROVIDER` | `mock` \| `revenuecat` | `REVENUECAT_SECRET_API_KEY` |
| `PRINT_PROVIDER` | `mock` | — (no partner selected yet) |
| `PUSH_PROVIDER` | `mock` \| `expo` | `EXPO_ACCESS_TOKEN` (not schema-enforced) |
| `ANALYTICS_PROVIDER` | `noop` \| `posthog` | `POSTHOG_API_KEY` (not schema-enforced) |

Model and tuning knobs, all defaulted: `ANTHROPIC_STORY_MODEL`
(`claude-sonnet-5`), `OPENAI_STORY_MODEL` (`gpt-5`), `MODERATION_MODEL`
(`omni-moderation-latest`), `IMAGE_MODEL` (`gpt-image-1`),
`IMAGE_USE_REFERENCE_IMAGES` (`true`), `ELEVENLABS_TTS_MODEL`
(`eleven_multilingual_v2`), `IYZICO_BASE_URL` (the **sandbox** host — change it
for live acquiring), `REVENUECAT_ENTITLEMENT_ID` (`premium`), `POSTHOG_HOST`
(`https://eu.i.posthog.com`).

`REVENUECAT_WEBHOOK_AUTH_HEADER` is optional in the schema but is what the
`POST /subscriptions/webhook` route authenticates with; a RevenueCat integration
without it accepts unauthenticated store callbacks.

`PRINT_PROVIDER` accepts only `mock`, and unlike the others it is not on the
production refusal list — printing is the one pipeline whose real adapter does
not exist yet.

### Retention and observability

| Variable | Default | Notes |
|---|---|---|
| `VOICE_RAW_RETENTION_DAYS` | `30` | 0–365. Published to every client through `GET /app/config` and enforced by the nightly sweep — changing it changes a promise, not just a job |
| `SENTRY_DSN` | — | |

### Variables the API schema does not read

These are real and used; they belong to other workspaces or tools, which is why
`parseEnv` ignores them. Do not expect a boot-time error when one is wrong.

| Variable | Used by |
|---|---|
| `SHADOW_DATABASE_URL` | Prisma, for `migrate dev` |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` | Test configs (declared in `turbo.json`) |
| `MASALIM_ROLE` | Set by `main.worker.ts`; gates every queue consumer |
| `CHROMIUM_EXECUTABLE_PATH` | `packages/book-render/src/renderer.ts`, read from `process.env` |
| `ADMIN_PORT`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_API_URL` | The admin panel |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | `packages/database/prisma/seed.ts` |
| `EXPO_PUBLIC_*` | Bundled into the mobile app at build time |
| `MASALIM_TEST_LOGS` | Set to `1` to un-silence the logger in tests |

`EXPO_PUBLIC_*` values are compiled into the shipped binary. Nothing secret goes
there.

## Database

Prisma lives in `packages/database`; every command has a root alias.

| Command | Underneath | When |
|---|---|---|
| `pnpm db:generate` | `prisma generate` | After a schema change, and in CI before typecheck |
| `pnpm db:migrate` | `prisma migrate dev` | Local: authors a migration and applies it |
| `pnpm --filter @masalim/database migrate:create` | `migrate dev --create-only` | Author the SQL, review it, apply later |
| `pnpm db:migrate:deploy` | `prisma migrate deploy` | **Staging and production** |
| `pnpm db:reset` | `migrate reset --force` | Destructive; local only |
| `pnpm db:seed` | `tsx prisma/seed.ts` | Reference data |
| `pnpm db:studio` | `prisma studio` | |

`migrate dev` needs `SHADOW_DATABASE_URL` — a throwaway database it diffs
against. `migrate deploy` does not: it applies committed migrations and never
generates one, which is exactly the property you want in a deployment step.

Migrations are committed under `packages/database/prisma/migrations/`. The
deploy order is: run migrations, then start the new API and worker. Nothing in
the codebase runs migrations at boot, on purpose — a process that migrates on
startup migrates once per replica.

Seeding is upsert-based and safe to re-run. It creates an `AdminUser` only when
`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are both set, and when `NODE_ENV` is
`production` it refuses a password shorter than 16 characters, so the seed cannot
quietly become a weak production administrator. Outside production a short
password is accepted, which is what makes a local admin login convenient — and
exactly why that database should never be reachable from anywhere else.

## Building and starting

```bash
pnpm build            # turbo run build across every workspace
```

For the API that is `nest build` into `apps/api/dist`. Then, per process:

```bash
node dist/main.js          # HTTP        — pnpm --filter @masalim/api start
node dist/main.worker.js   # jobs        — pnpm --filter @masalim/api start:worker
```

Both processes need the same environment: the same database, the same Redis, the
same provider credentials. The worker holds no HTTP port. Scale them
independently — that is the reason they are separate entrypoints.

Both call `enableShutdownHooks()`, and the destroy hooks close BullMQ queues and
workers, the Redis clients and both Prisma clients. Send `SIGTERM` and give the
process time to drain rather than killing it: a worker interrupted mid-purge is
recoverable, but a worker killed mid-narration wastes a provider call.

## Deploying with containers

`Dockerfile` builds four targets from one builder, and `docker-compose.prod.yml`
wires them together with Postgres, Redis and MinIO.

```bash
cp .env.deploy.example .env.deploy      # then fill in the four required values
docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d --build
```

The targets are `api`, `worker`, `admin` and `migrate`. Three things about that
split are deliberate:

**Only the worker carries Chromium.** Rendering a book to PDF is queued work, so
the browser belongs in the process that does it. Putting it in the HTTP image
would triple the size of the container you scale horizontally. The worker also
gets `shm_size: 1gb`, because Chromium cannot render a full-page spread in the
default 64MB.

**Migrations are their own one-shot service.** Two API replicas booting together
would otherwise race the same migration, and a schema failure would look like a
crash-looping application rather than what it is. `api` and `worker` both wait on
`service_completed_successfully`.

**Debian, not Alpine.** Prisma ships a native query engine per libc/OpenSSL
combination and Playwright's Chromium expects glibc. The schema pins
`debian-openssl-3.0.x` explicitly so the generated client matches the image
regardless of where `prisma generate` ran.

The API's healthcheck hits `/health/ready`, which reports `up` only once its
Postgres and Redis connections are usable — that is what an orchestrator should
wait on before sending traffic, rather than `/health`, which answers as soon as
the process is listening.

### Pointing the app at it

The mobile app compiles its API URL in at build time from `EXPO_PUBLIC_API_URL`,
so it cannot be redirected afterwards. Set it in the EAS profile
(`apps/mobile/eas.json`) to the same public origin as `API_BASE_URL` before
building, or the installed app will keep calling whatever it was built against.

`STORAGE_PUBLIC_URL` matters for the same reason and is easy to get wrong: it is
the origin the *phone* fetches audio and illustrations from, not the internal
endpoint the API uploads to. Set it to the internal one and every story will
generate successfully and then fail to play.

## What production needs that local development does not

**A different `APP_ENV`.** Setting `APP_ENV=production` turns on refusals that
are off everywhere else: no provider may be `mock`, `STORAGE_PROVIDER` may not be
`local`, the JWT secrets may not contain the development placeholders, and the
credential for each selected provider must be present. This is checked in the
config schema and again in the provider factories. A process that boots is a
process that is not running a mock.

**Real credentials and a real storage backend.** `STORAGE_PROVIDER=s3` plus
endpoint, keys, bucket and `STORAGE_PUBLIC_URL`. The local-disk driver's upload
and download routes (`PUT`/`GET /uploads/local`) exist only for the `local`
driver.

**`CORS_ORIGINS` set explicitly.** An empty value reflects whatever origin asks.

**Exactly one proxy layer.** `app.set('trust proxy', 1)` in `create-app.ts` means
the client IP is taken from one hop of `X-Forwarded-For`. Rate limiting and the
hashed IPs stored with voice consent are only as truthful as that setting.

**At least one worker process.** Also the retention passes: deletion requests and
the nightly recording sweep run only where `MASALIM_ROLE=worker`. An API-only
deployment silently stops honouring its own data-retention promises.

**Chromium available to the worker.** The book renderer launches Playwright. CI
does `pnpm --filter @masalim/book-render exec playwright install --with-deps
chromium`; an image that already ships a browser should instead set
`CHROMIUM_EXECUTABLE_PATH`, because Playwright otherwise insists on its exact
build revision and fails to launch.

**Log handling.** Pino emits JSON everywhere except `APP_ENV=development`. Ship
stdout to the log pipeline; the redaction list in
`core/logger/logger.service.ts` already strips tokens, passwords, card fields and
signed URLs.

**A decision about `/docs`.** `setupOpenApi` runs unconditionally in the HTTP
entrypoint, so the Swagger UI and `docs/openapi.json` are served in production
too. If that surface should not be public, block it at the edge.

**Health checks wired to the right endpoints.** `GET /health` for liveness,
`GET /health/ready` for readiness — with the caveat about its status code
described in [`operations.md`](operations.md).

## CI

`.github/workflows/ci.yml` runs three jobs: `quality` (lint, typecheck, unit
tests), `integration` (PostgreSQL and Redis services, `db:migrate:deploy`,
`db:seed`, then `pnpm test:e2e`) and `build`. The integration job sets
`APP_ENV=development` with every provider on `mock` — the same posture as a
laptop, which is what makes those tests exercise real pipeline code without a
single credential.
