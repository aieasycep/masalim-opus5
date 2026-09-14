# Getting Masalım onto a phone, for nothing

The goal of this directory is narrow: an API somewhere a phone can reach, and an
app on that phone, without spending money. Every provider stays on its mock, so
the whole product is clickable — stories generate from templates, narration is a
silent file of the right length, illustrations are placeholders, payment always
succeeds — before a single API key exists.

## What has actually been verified

Being clear about this matters more than usual here, because the parts that
could not be checked are the parts that decide whether you get charged.

**Verified by running it, on this codebase:**

- Migrations apply to an empty database.
- The production build boots, and `/health/ready` reports Postgres and Redis up.
- A full journey works end to end against the running API: sign-up → child
  profile → story creation → the worker taking the job to `COMPLETED 4/4` → a
  `READY` ten-page Turkish story.
- `MASALIM_ROLE=all` makes one process do both jobs — same journey, one process.
- Every environment variable named in these documents exists in
  `apps/api/src/core/config/config.schema.ts`.

**Not verified, and you must check before relying on it:**

- **Every claim about a hosting provider.** Free-tier limits, sleep and pause
  behaviour, what is paid-only, prices. This repository is built in a sandbox
  whose network policy blocks provider documentation — confirmed by a 403 on
  every attempt — so those passages come from prior knowledge and are undated.
- **The `Dockerfile`.** It has never been built. Docker Hub's blob CDN is
  blocked here too. It is written from checked facts about this codebase, not
  from a successful build. The Render path deliberately avoids it.

## The order to do things in

Each step has to exist before the next one can work, and the last one bakes the
result of the earlier ones into a binary that cannot be changed afterwards.

1. **A database** — [`database.md`](database.md). The one technical trap is that
   Prisma migrations cannot run through a transaction pooler, so the pooled and
   direct connection strings are not interchangeable.
2. **Redis and object storage** — [`redis-storage.md`](redis-storage.md). Read
   the Redis section before choosing a provider: BullMQ holds blocking
   connections, which suits some free Redis offerings very badly.
3. **The API** — [`render.md`](render.md) and `render.yaml`. One free service
   runs HTTP and the queue together via `MASALIM_ROLE=all`. That is worse under
   load and the document says exactly how.
4. **The app** — [`mobile.md`](mobile.md). Two routes, and the first needs no
   build at all.

## About the app on your phone

**Expo Go is the fast route.** The app should run in it today, because the two
native modules Expo Go lacks — Google sign-in and Apple sign-in — are both
loaded through `await import()` in
`apps/mobile/src/components/SocialAuthButtons.tsx`, so nothing reaches them at
startup. Email sign-in and every other journey work. Those two buttons will
fail if tapped.

**An APK needs EAS Build**, which runs on Expo's infrastructure under your
account. It cannot be produced from this repository's build environment: an
Android build needs the Android SDK and the AndroidX artifacts, both served from
`dl.google.com`, which the sandbox's network policy refuses. `eas.json` is
configured and `mobile.md` has the commands, but the build itself is yours to
run.

Whichever route, `EXPO_PUBLIC_API_URL` is compiled into the binary at build
time. Point it at the deployed API before building, or the installed app will
keep calling whatever it was built against.

## Keeping the first tap fast

A sleeping free instance takes long enough to wake that the first request can
exceed the mobile client's 30-second timeout, and the parent sees "İnternet
bağlantın yok gibi" — honest copy for the wrong reason, since their connection
is fine. `.github/workflows/keep-warm.yml` pings `/health/ready` every ten
minutes and does nothing until you set the `STAGING_API_URL` repository
variable.

Queries recover from this on their own — React Query retries with backoff — but
mutations do not retry, so a sign-in or a "write me a story" tap that lands on a
cold start fails once and works on the second try. Keeping the instance warm is
what removes that.

## Before you let anyone else near it

`pnpm db:seed` creates demo accounts with the password `masalim-demo-2026`,
which is committed to this repository. It skips them only when
`APP_ENV=production` (`packages/database/prisma/seed.ts`), and the free-tier
deploy runs `staging` — so on this path they *will* be created. On a public URL
that is a published username and password.

Either skip the seed and create your own account through sign-up, or change that
constant before seeding, or keep the URL to yourself. Reference data — interests,
system voices, print products — comes from the same seed and the app is thin
without it, so simply never seeding is not free of cost either.
