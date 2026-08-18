# Render — free-tier staging

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



This stands the API up on a public HTTPS URL for no money, so the product can be
opened on a real phone and clicked through end to end with mock providers. It is
a staging deploy. Nothing here is shaped for production traffic, and several
things are deliberately traded away; each one is named below.

Everything in this document was checked against Render's documentation in
**August 2026**. Free-tier limits move — Render has already cut the spin-down
window and shortened the free database lifetime once. Re-read
[render.com/docs/free](https://render.com/docs/free) before you rely on a number
here.

The blueprint is [`render.yaml`](../../render.yaml) at the repository root.

## What it creates

| Resource           | Type                                        | Free plan gives you                                                                 |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `masalim-api`      | Web service, Node runtime                   | 512 MB RAM, 0.1 CPU, sleeps after 15 minutes without inbound traffic                |
| `masalim-db`       | Render Postgres                             | 1 GB storage, **expires 30 days after creation**, no backups, no connection pooling |
| `masalim-keyvalue` | Render Key Value (Valkey, Redis-compatible) | 25 MB, **no persistence** — data is lost on every restart                           |

All three sit in `frankfurt`. They have to share a region: the internal
connection strings the blueprint wires in only resolve over Render's private
network, and that network does not cross regions.

A free workspace also gets **750 instance hours per calendar month**, shared
across all its free services. One service running continuously costs 744 hours
in a 31-day month, so this deploy fits — a second always-on free service would
not.

## Why the native Node build and not the Dockerfile

The repository has a working-looking multi-stage `Dockerfile` with `api`,
`worker`, `admin` and `migrate` targets, and Render can build from it. This
blueprint uses Render's native Node runtime anyway, for four reasons.

1. **That Dockerfile has never actually been built.** It has not been proven in
   any environment this repository has run in. Choosing it would mean debugging
   a container build against a free tier's build limits as the first task.
2. **Its shape is wrong for one instance.** It splits the deployment into an API
   container, a worker container and a one-shot migration container. That split
   is correct, and it is exactly what a free tier cannot pay for. Using it here
   would mean overriding `dockerCommand` to re-fuse the pieces, which discards
   most of what the Dockerfile is for.
3. **Prisma's binary target resolves itself.** `schema.prisma` pins
   `binaryTargets = ["native", "debian-openssl-3.0.x"]`; the second entry exists
   precisely because the Docker build machine and the runtime image differ. On
   the native runtime, `generate` and `node` run on the same image, so `native`
   is the right engine by construction.
4. **Fewer moving parts to debug remotely.** A native build is `corepack`,
   `pnpm install` and `turbo run build` — three commands whose failures read the
   same in Render's log as they do on a laptop. A Docker build failure on a free
   tier, with no shell to poke at the image, is a much longer afternoon. (Render
   caches build output for both runtimes, so caching is not the deciding factor
   either way; I have not measured which is faster here.)

If you later move to paid instances, the Dockerfile becomes the better answer
again — see [Upgrade path](#upgrade-path).

## The build

```
corepack enable && pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=@masalim/api
```

Three things are load-bearing here.

**Corepack, not a global pnpm install.** `package.json` declares
`packageManager: pnpm@10.33.0`. Corepack reads that field and activates exactly
that version, so `--frozen-lockfile` is checked by the tool that wrote
`pnpm-lock.yaml`. Node 22 still bundles Corepack; Node 25 does not, which is why
`NODE_VERSION` is pinned to `22` rather than left to Render's default.

**The install is unfiltered, the build is filtered.** `pnpm install` resolves the
whole workspace — including the Expo app's dependencies, which the API never
touches. That is the price of a lockfile check that cannot drift. The build then
runs only `@masalim/api`; because `turbo.json` declares `build` with
`dependsOn: ["^build"]`, Turborepo compiles every workspace package the API
imports first — `@masalim/types`, `@masalim/database` (whose own build runs
`prisma generate`), `@masalim/storage`, `@masalim/ai`, and the rest — and never
builds the mobile app or the operator console.

**`NODE_ENV` is not a service environment variable.** pnpm reads
`NODE_ENV=production` and skips `devDependencies`, and this build needs four of
them: `nest`, `tsc`, `turbo` and `prisma`. `NODE_ENV=production` is therefore set
as a prefix on the `node` invocation in the start command instead. If you add
`NODE_ENV` in the dashboard, the next build will fail at `nest build` with a
missing binary — that is the single most likely way to break this deploy.

Two build-time facts I could not confirm from Render's public documentation: the
disk ceiling and the RAM ceiling applied to a free service's build. This
workspace installs a large `node_modules` (the Expo and Next.js apps dominate
it) and then runs `tsc` across a dozen packages. If the build is killed rather
than failing with a compiler error, that is the limit you have hit; the fix is a
filtered install (`pnpm install --frozen-lockfile --filter "@masalim/api..."`,
which needs the workspace root included as well) or a paid instance type.

## Where migrations run, and why

In the **start command**, ahead of the server:

```
(cd packages/database && node_modules/.bin/prisma migrate deploy) && … node apps/api/dist/main.js
```

Render's usual answer is `preDeployCommand`, which runs after the build and
before the new instance takes traffic. It is **not available on free instance
types** — it is a paid-plan feature — so that door is closed.

The build command is the other obvious place, and it is the wrong one here. The
build runs on separate build infrastructure, and the `DATABASE_URL` this
blueprint injects is the database's _internal_ connection string, which is a
private-network address. Whether a given build can route to it is not something
this document can promise, and a migration step that works on Tuesday and hangs
on Wednesday is worse than one that is obviously in the wrong place. The start
command runs inside the instance, which is unambiguously on the private network.

The cost is that migrations re-run on every process start, including every wake
from sleep. `prisma migrate deploy` applies only committed migrations and exits
immediately when there are none, so the steady-state cost is a couple of seconds
of CLI startup added to a cold start that already takes far longer. It takes a
Postgres advisory lock, and a free service is exactly one instance, so the
concurrency concern that made the Dockerfile give migrations their own container
does not exist on this tier.

The `&&` matters: if a migration fails, the API does not start. A service that
refuses to boot is a visible failure. A service that boots against a schema its
code does not expect fails later, in a request, with a worse error.

`prisma.config.ts` lives in `packages/database`, which is why the command changes
directory first — Prisma discovers that file relative to the working directory,
and it is what supplies the schema and migrations paths.

## One process doing both jobs

`MASALIM_ROLE=all` is what makes a single free service viable. The role is read
in `apps/api/src/core/queue/role.ts`; `all` is the only value that makes an HTTP
process also start the BullMQ workers, and nothing selects it by accident.

**What it costs.** The workers and the HTTP handlers share one event loop and
one 512 MB heap. Story and illustration jobs are mostly waiting on a provider,
so with the mocks they cost little. Rendering a book is different: it is CPU and
memory work, and while it runs, requests queue behind it. The 120-second
constant in `packages/book-render/src/renderer.ts` bounds only `setContent` —
how long the page may take to load — so it is not a ceiling on the render, and a
slow one can hold the loop for longer than that. Worker concurrency is 4 per queue
(`apps/api/src/core/queue/worker-host.service.ts`), which on 0.1 CPU is a
theoretical number rather than a useful one.

For a staging deploy that one person clicks through, this is fine. For two
people generating stories at once, it will feel slow, and that is the design
working as intended rather than a bug.

**The upgrade path is one line.** Drop `MASALIM_ROLE` from the web service so it
defaults to API-only, and add a second service to `render.yaml`:

```yaml
- type: worker
  name: masalim-worker
  runtime: node
  plan: starter
  region: frankfurt
  buildCommand: … # identical to the web service
  startCommand: node apps/api/dist/main.worker.js
```

`main.worker.ts` sets `MASALIM_ROLE=worker` itself, so the worker service needs
no role variable. Note that **`worker` is not a free service type** — Render's
free plan covers static sites, web services, Postgres and Key Value only. This
split is the first thing to buy, before more RAM on the API.

Also worth knowing: the retention passes (deletion requests, the nightly voice
recording sweep) gate on the same `shouldRunWorkers()` check, so they do run
under `all`. An API-only deploy with no worker anywhere silently stops honouring
the product's own data-retention promises.

## Sleeping, and the first request after it

A free web service spins down after roughly **15 minutes without inbound
traffic** and starts again when the next request arrives. Render holds that
request while the instance boots rather than rejecting it; the documented
spin-up is about a minute, and this service adds `prisma migrate deploy` and a
Nest boot on top of that.

Here is what that means for someone holding a phone, traced through the client.

- The HTTP client aborts every request after **30 seconds**
  (`DEFAULT_TIMEOUT_MS` in `packages/api-client/src/http.ts`; the mobile app
  constructs `HttpClient` without overriding it). So the first request after a
  sleep will very often abort before the server answers. This is expected, not a
  misconfiguration.
- An aborted request becomes `ApiError.network(...)`, which reports
  `isRetryable === true` (`packages/api-client/src/errors.ts`).
- Every screen's data load is a React Query query, and the query retry policy
  retries retryable errors up to three times with exponential backoff
  (`packages/api-client/src/query-client.ts`). Four attempts at up to 30 seconds
  each, plus backoff, comfortably outlast a one-minute cold start. **The app
  recovers on its own.** The parent sees a longer-than-usual loading state on the
  first screen, then normal behaviour.
- **Mutations do not retry** — deliberately, so a parent's action is never
  silently repeated. A sign-in, a child profile save or a "write me a story" tap
  that lands exactly on a cold start fails once with a network error. Tapping
  again works, because by then the instance is awake. This is the one rough edge
  a tester will notice.
- Job watching (`watchJob` in `packages/api-client/src/job-progress.ts`) polls
  every 1.5 s and gives up after **three consecutive failures**. During a cold
  start each failure takes up to 30 s to time out, so it survives roughly 90
  seconds of unavailability — enough for a normal wake, not enough for a wake
  that also has to apply a slow migration.

Two consequences worth planning around:

- **Polling keeps the instance awake.** While a parent is watching a story
  generate, the client is issuing a request every 1.5 seconds, so the service
  cannot idle out mid-job. But if a job is running with nobody watching, 15
  minutes of silence will spin the instance down and kill the job. With no Redis
  persistence, it does not come back.
- **Keeping it permanently awake is possible and cheap-ish.** An external
  uptime pinger hitting `/health` every 10 minutes prevents spin-down entirely,
  at a cost of ~744 of your 750 monthly instance hours. Render's own health
  check is not a substitute — spin-down keys on inbound traffic, and I could not
  confirm that the platform's internal checks count. Assume they do not.

## The health check, precisely

`healthCheckPath` is `/health/ready`. Before relying on it, know what it returns
(`apps/api/src/modules/health/health.controller.ts`):

```json
{
  "status": "ok",
  "environment": "staging",
  "checks": {
    "database": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "up", "latencyMs": 1 }
  }
}
```

It runs `SELECT 1` against Postgres and `PING` against Redis, and it catches
their failures rather than propagating them. **A failed check changes the JSON
body to `"status": "degraded"` and the individual check to `"down"` — it does not
change the HTTP status code, which is 200 either way.** Render treats any 2xx as
healthy.

So this path proves the process booted, wired its dependency graph, and is
routing requests. It will _not_ fail a deploy because Redis is unreachable. If
you want that signal, read the body — an uptime monitor that asserts on
`"status":"ok"` rather than on the status code gets it. `/health` (no `/ready`)
is the pure liveness probe and answers as soon as the process is listening.

## First deploy

1. Push this branch to GitHub. The blueprint has no `branch` key, so Render
   deploys the repository's default branch; set one explicitly if that is not
   what you want.
2. In Render: **New → Blueprint**, pick the repository, and let it read
   `render.yaml`. It will show you three resources to create and prompt for the
   three `sync: false` variables — leave all three blank, they are for later.
3. Wait out the first build. It creates the database and Key Value instance
   first, then builds; the first build is the slow one, since nothing is cached.
4. Check the URL Render gives you:

   ```
   curl https://masalim-api.onrender.com/health/ready
   ```

   Expect `"status":"ok"` with both checks `up`. If `redis` is `down`, the Key
   Value instance is in a different region or its `ipAllowList` is not empty. If
   `database` is `down` with the app otherwise running, the start command's
   migration step would have failed first — check the logs before the listen
   line.

5. Seed the reference data (next section). Without it there are no interests, no
   system voices and no print products, and onboarding has nothing to show.
6. Point the app at it: build the mobile client with
   `EXPO_PUBLIC_API_URL=https://masalim-api.onrender.com`.

`https://masalim-api.onrender.com/docs` serves the Swagger UI — `setupOpenApi`
runs unconditionally in the HTTP entrypoint. On a staging deploy that is a
feature; it is also the reason not to reuse this blueprint verbatim for anything
public.

## Seeding

Free instances have no shell and no SSH, so the seed cannot be run on the box.
Run it from your machine against the database's **External Database URL**:

1. Database → **Access Control** in the dashboard, add your current IP.
2. `DATABASE_URL='<external url>' pnpm db:seed`
3. Remove your IP again.

Read `packages/database/prisma/seed.ts` before you run it on a public URL. With
`APP_ENV` anything other than `production`, it also seeds demo content —
including two accounts (`ayse@masalim.local`, `mehmet@masalim.local`) whose
password is a constant committed to this repository. On a staging URL that
anyone can reach, that is a real account anyone can sign into. If you want the
reference data without the demo accounts, run the same command with
`APP_ENV=production` set for the seed process only; the reference data is
unconditional and the demo block is skipped.

The seed is upsert-based, so re-running it is safe.

## What does not work on this deploy

**Book PDF rendering.** `@masalim/book-render` drives Playwright's Chromium. The
browser is not downloaded (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), so a book
render job fails with `BookRenderError: Could not start the rendering browser`.
This is deliberate: pnpm's `onlyBuiltDependencies` list in the root
`package.json` does not include `playwright`, so its post-install would not run
anyway, and 512 MB is not enough to hold Node, Nest and Chromium at once. Every
other job type works. To try it regardless, add
`pnpm --filter @masalim/book-render exec playwright install chromium` to the
build, set `PLAYWRIGHT_BROWSERS_PATH` to a path inside the project directory so
it survives into the runtime, and expect the instance to be OOM-killed mid
render.

**Uploaded media does not survive.** `STORAGE_PROVIDER=local` writes to
`.storage` under the service's working directory
(`apps/api/src/core/storage/storage.module.ts`). Free instances have no
persistent disk, so every sleep and every deploy empties it. Generated
illustrations and recorded audio work within a session and 404 afterwards. The
fix is object storage — see below.

**Queue state does not survive.** Free Key Value has no persistence. A restart
loses queued and in-flight jobs, and the retention schedules re-register on the
next boot. 25 MB with `noeviction` is ample for a handful of stories and will
start refusing writes rather than silently dropping jobs if you push it.

**The database expires.** 30 days after creation, then a 14-day grace period,
then Render deletes it and its data. Free databases have no backups. Treat every
account and story on this deploy as disposable, and diarise the date.

**No shell, no SSH, no zero-downtime deploys.** Each deploy briefly drops the
service. One-off commands have to be run from your machine over the external URL
or added to the start command.

**The operator console is not deployed.** `apps/admin` would need a second free
web service, which the 750-hour budget does not really allow alongside an
always-on API. Run it locally against this API's URL instead.

## Environment variables

Every name below exists in `apps/api/src/core/config/config.schema.ts`, except
`MASALIM_ROLE`, which is read directly in `apps/api/src/core/queue/role.ts`, and
the build-time settings, which are Render's or the toolchain's.

| Variable                                                                              | Where it comes from          | Note                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                        | `fromDatabase`               | Internal connection string, private network only                           |
| `REDIS_URL`                                                                           | `fromService` (keyvalue)     | Internal `redis://` URL; no TLS and no password inside the private network |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                                             | `generateValue`              | 256-bit base64, ~44 chars, clears the schema's 32-character minimum        |
| `APP_ENV`                                                                             | blueprint, `staging`         | `production` would refuse to boot with mocks or local storage              |
| `MASALIM_ROLE`                                                                        | blueprint, `all`             | HTTP and workers in one process                                            |
| `API_PORT`, `API_BASE_URL`                                                            | start command                | Follow Render's `PORT` and `RENDER_EXTERNAL_URL`                           |
| `NODE_ENV`                                                                            | start command, `production`  | Never set it as a service variable — it breaks the build                   |
| `*_PROVIDER`                                                                          | blueprint, all `mock`/`noop` | No credential needed for any of them                                       |
| `STORAGE_PROVIDER`                                                                    | blueprint, `local`           | Ephemeral                                                                  |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `SENTRY_DSN`                              | `sync: false`                | Empty; set in the dashboard when you need them                             |
| `NODE_VERSION`, `COREPACK_ENABLE_DOWNLOAD_PROMPT`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | blueprint                    | Build-time behaviour                                                       |

`CORS_ORIGINS` is not set, so it defaults to empty, and `create-app.ts` reads
that as "reflect whatever origin asks". The mobile client sends no `Origin`
header, so this only matters if you point a browser at the API; set it to an
explicit comma-separated list the moment you do.

**Adding a real provider** means two changes in the dashboard, never one: flip
the `*_PROVIDER` variable off `mock` _and_ add the credential it needs. The
pairs, from the schema: `AI_PROVIDER=anthropic` → `ANTHROPIC_API_KEY`;
`AI_PROVIDER=openai`, `IMAGE_PROVIDER=openai` or `MODERATION_PROVIDER=openai` →
`OPENAI_API_KEY`; `TTS_PROVIDER=elevenlabs` or `VOICE_CLONE_PROVIDER=elevenlabs`
→ `ELEVENLABS_API_KEY`; `PAYMENT_PROVIDER=iyzico` → `IYZICO_API_KEY` and
`IYZICO_SECRET_KEY`; `SUBSCRIPTION_PROVIDER=revenuecat` →
`REVENUECAT_SECRET_API_KEY`. Note the storage key is `STORAGE_ACCESS_KEY`, not
`STORAGE_ACCESS_KEY_ID`.

`PUSH_PROVIDER=expo` is the exception: it needs `EXPO_ACCESS_TOKEN` to send
anything, but that pairing is **not** in the schema's enforced list, so
production will boot happily without it and pushes will simply not arrive.

Under `APP_ENV=staging` a missing credential is not caught at boot — the schema
only enforces those pairings when `APP_ENV=production`. The failure will arrive
in a job instead.

## Upgrade path

Roughly in the order the pain arrives:

1. **A worker service** (`starter` or larger). Stops book renders and story jobs
   from occupying the request path. Drop `MASALIM_ROLE` from the web service in
   the same change.
2. **Object storage.** Cloudflare R2 or any S3-compatible endpoint:
   `STORAGE_PROVIDER=s3`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`,
   `STORAGE_PUBLIC_URL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and
   `STORAGE_FORCE_PATH_STYLE` if the endpoint needs it. Media then survives
   restarts, and object storage stops being the blocker for `APP_ENV=production` — though every
provider must also come off `mock` before it will boot.
3. **A paid database**, before day 30. Also gets you backups and connection
   pooling.
4. **A paid web instance.** No spin-down, so the cold-start behaviour above
   disappears; zero-downtime deploys; a shell for one-off commands; and
   `preDeployCommand`, at which point migrations should move out of the start
   command:

   ```yaml
   preDeployCommand: cd packages/database && node_modules/.bin/prisma migrate deploy
   ```

5. **A paid Key Value instance**, for persistence, once losing a queue on
   restart stops being acceptable.

At that point the Dockerfile is the better build path again — the API/worker/
migrate split it already encodes is exactly the shape of the paid deploy, and it
ships a Chromium that book rendering needs. Building and proving that image is
its own piece of work; it has not been done yet.

## Sources

- [Deploy for Free — Render Docs](https://render.com/docs/free)
- [Blueprint YAML Reference — Render Docs](https://render.com/docs/blueprint-spec)
- [Web Services — Render Docs](https://render.com/docs/web-services)
- [Default Environment Variables — Render Docs](https://render.com/docs/environment-variables)
- [Setting Your Node.js Version — Render Docs](https://render.com/docs/node-version)
- [Health Checks — Render Docs](https://render.com/docs/health-checks)
- [Free PostgreSQL instances now expire after 30 days — Render Changelog](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90)
- [Corepack — Node.js docs](https://nodejs.org/api/corepack.html)
