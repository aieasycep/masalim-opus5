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
| Testable by a person | ~55% — database and API are deployed |
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
- [ ] **4. The app.** Expo Go first — it needs no build and should work today.
      Then EAS Build for an APK.

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

1. **No visual verification.** Not one screen has been seen rendering. Tests and
   typechecks say the code is correct, not that the app looks or flows right.
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
