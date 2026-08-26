# Where this project is, and what to do next

Written so that a session starting from nothing can continue without re-deriving
any of it. Update it when the state below stops being true.

Branch: `claude/masalim-implementation-plan-0gqi51` (PR #1, draft).

## Status in one paragraph

The product is built and tested: 68 mobile screens, 19 API modules, 45 database
models, an operator console, 1156 passing tests, CI green. What is *not* done is
everything between "the code works" and "a parent can use it" — nothing has been
seen rendering visually, no end-to-end tests exist, and the deploy is half
finished. Physical book printing has no real integration at all.

Honest completion, by the measure that matters:

| | |
| --- | --- |
| Code written | ~90% |
| Testable by a person | ~70% — an APK installs and runs against the deploy |
| Ready for real users | ~15% |

## The deploy, step by step

The goal is a free staging deploy the mobile app can reach, with every provider
on its mock, so the whole product is clickable before any API key exists.

- [x] **1. Postgres — done.** Supabase, project ref `aluumnocammrfrgvgjry`,
      region eu-central-1. All 4 migrations applied; seed loaded (12 interests,
      6 system voices, 4 print products, demo users `ayse@masalim.local`
      (premium) and `mehmet@masalim.local` (free), password `masalim-demo-2026`).
      **Connection string must be the one on port 5432** — the
      `pooler.supabase.com` host, not `db.<ref>.supabase.co`, which resolves
      IPv6-only and is unreachable from most networks. Port 6543 is a
      transaction pooler and cannot run migrations; this schema declares no
      `directUrl`, so one string does both jobs.
- [x] **2. Render — done.** `https://masalim-api-1do8.onrender.com`, region
      frankfurt, free plan, one process serving HTTP and the queue
      (`MASALIM_ROLE=all`). The blueprint applied unchanged on the first
      attempt. `/health/ready` answers `ok` with Postgres and Redis both up.
      `DATABASE_URL` is set by hand in the dashboard; the three other
      dashboard-set variables are deliberately blank.
- [ ] **3. Storage.** Supabase Storage or Cloudflare R2 through the existing S3
      adapter. `STORAGE_ENDPOINT` is where the API uploads; `STORAGE_PUBLIC_URL`
      is where the phone downloads. Confusing them produces stories that
      generate fine and then fail to play.
- [x] **4. The app — done.** An APK is built by
      `.github/workflows/build-apk.yml`, run by hand from the Actions tab. It
      needs one repository secret, `EXPO_TOKEN`; the EAS project id is committed
      in `app.config.ts` because a generated config is one EAS cannot write back
      into. The build runs on Expo's infrastructure, which is the only route
      available: an Android build needs `dl.google.com`, and this environment is
      refused it.

## What the first real build taught us

Three faults that only a device could have found, all now fixed. They are
recorded because each was invisible to types, tests and review.

- **The launch gate opened on the session alone.** A signed-out parent landed on
  the signed-in tabs, watching skeletons that could never load, because the
  redirect waited for the launch-config query while the render did not. The
  decision is now `src/lib/app-gate.ts`, tested against exactly that case.
- **The player crashed the app on open.** Its unmount save read a property off
  the audio player, and that effect depended on the player — whose identity
  changes the moment a real source replaces the empty one it was created with.
  React ran the old cleanup after the native object had been released.
- **The Create button sat where its gap was not.** Three tabs cannot have a gap
  in the middle; the centre falls inside the middle tab. It is a fourth slot now.

Still unexplained: creating a narration showed an error screen on the device.
The same flow, run against a local stack with the same mock providers, completes
`4/4` and produces a playable file. Whatever it is, it is specific to the
deploy, and Render's logs are the only place it can be seen — this environment
cannot reach them.

## The staging deploy is not reliable, and that is expected

On 20 August the API returned 502 for roughly four and a half hours and then
recovered on its own, with no deploy and no change from us. A crash loop in our
own code does not repair itself, so this was the platform: a free instance being
moved or an incident.

Three shorter outages followed, each recovering on its own within the hour, and
their shapes differ in a way worth keeping:

| When | What the ping saw |
| --- | --- |
| 24 Aug 08:04 | `curl 56` — the connection was accepted and dropped inside a second |
| 25 Aug 09:06 | `curl 28` — 150 seconds, twice, **zero bytes** |
| 26 Aug 10:03 | `curl 28` — the same, again |

The second shape is a process that never binds a port while the router holds the
caller waiting. That is what bounding the migration below is aimed at. It is a
mitigation reasoned from the signature, not a diagnosis: nobody has read Render's
own log for these, and this environment cannot.

Two related facts worth knowing before diagnosing anything:

- `.github/workflows/keep-warm.yml` pings every ten minutes on paper. In
  practice GitHub's scheduler drifts to anywhere between 16 and 50 minutes,
  while the host sleeps after 15 idle — so most pings are cold starts. It asks
  twice before reporting a failure for exactly this reason. A five-minute
  external pinger would do the job properly.
- The start command runs `prisma migrate deploy` before the port is bound, and
  because a free instance sleeps, it runs again on every wake. A migration that
  hangs therefore means the port is never opened and there is no HTTP surface
  left to diagnose it with — the caller just waits. It is now bounded at 60
  seconds and retried once, so a slow connect is a pause and a real failure is a
  crash Render restarts and records, rather than a silent hang.

## What this build environment cannot do

Tested, not assumed. Do not try to work around any of these.

| Blocked | Consequence |
| --- | --- |
| `dl.google.com` (403) | No Android SDK, no AndroidX. **An APK cannot be built here.** EAS Build, on the user's account, is the only route. |
| Docker Hub blob CDN (403) | The `Dockerfile` has never been built. It is written from checked facts, not from a successful build. |
| Provider documentation — render.com, supabase.com, upstash.com, expo.dev, neon.tech (all 403) | Every free-tier limit, price and behaviour in `docs/deploy/*.md` is from prior knowledge and undated. Each file says so at the top. |
| Raw TCP to port 5432, and no IPv6 | The user's Supabase cannot be reached from here. All database work is theirs to run. |

Postgres and Redis *are* available locally in the container, and the full stack
has been run against them.

## What was verified by running it

- Migrations apply to an empty database.
- The production build boots; `/health/ready` reports Postgres and Redis up.
- A full journey against the running API: sign-up → child → story → worker takes
  the job to `COMPLETED 4/4` → `READY` ten-page Turkish story.
- The same journey through a single process with `MASALIM_ROLE=all`.
- Every environment variable in the deploy docs exists in
  `apps/api/src/core/config/config.schema.ts` (checked programmatically).

## Traps discovered the hard way

Each of these cost a debugging cycle. They are not obvious from the code.

- **`APP_ENV=production` refuses to boot with any provider on `mock`**, or with
  `STORAGE_PROVIDER=local`. A free deploy must be `staging`.
- **`/health/ready` returns HTTP 200 even when its probes fail** — it reports
  `"degraded"` in the body. Any healthcheck must read the body, not `r.ok`.
- **`prisma migrate deploy` does not generate the Prisma client.** Running the
  seed straight afterwards fails; `prisma generate` has to run first.
- **Node 25+ has no `corepack`.** `npm install -g pnpm@10` instead.
- **The mobile client times out at 30 s** and mutations do not retry, so a tap
  landing on a cold start fails once. `.github/workflows/keep-warm.yml` fixes
  this once `STAGING_API_URL` is set as a repository variable.
- **The seed's demo accounts are created under `staging`** and their password is
  in this repository. Handle before sharing any URL.

## Known gaps, in the order they matter

1. **Barely any visual verification.** Sign-in, Home and the player have been
   seen on a real phone; every one of those three carried a fault that types and
   tests had passed. Sixty-odd screens have still never been looked at, and the
   base rate so far is not encouraging.
2. **No E2E tests.** Zero `testID` attributes across 68 screens, no Maestro
   flows. This is the prerequisite for catching regressions after deploy.
3. **Printing is not integrated.** `PRINT_PROVIDER: z.enum(['mock'])` — unlike
   every other provider, there is no real option. The product's premium promise
   is a printed book, and that is an integration still to be written.
4. **Book PDF rendering will not work on a 512 MB free instance** — Chromium
   cannot run beside Node there.
5. **Story and illustration outcome analytics depend on a screen staying open**,
   so completion rates from them are a floor. Emitting from the worker is the
   fix; the registry is dependency-free so the API can import it.

## Working agreements that have held up

- Never state a provider fact that could not be checked from here; mark it.
- Verify before claiming. Several confident claims — including some from review
  agents — turned out to be wrong when checked against the code.
- A test that passes with and without the fix is worse than no test. One was
  written and deleted for exactly that reason.
- Limits come from `@masalim/validation`; prices come from server quotes; copy
  comes from `@masalim/localization` with both locales in step.
