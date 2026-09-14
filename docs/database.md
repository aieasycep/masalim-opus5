# The data model

44 models and 36 enums in `packages/database/prisma/schema.prisma`, against PostgreSQL.
The schema is the source of truth; this document explains the parts whose shape is a
decision rather than an obvious consequence.

## Two clients, one connection story

`PrismaService` exposes two:

```ts
prisma.client   // soft-delete filter applied — use this in request handlers
prisma.raw      // unfiltered — deletion workers and a few admin reads only
```

A soft-deleted row is invisible through `client`. That is what makes "deleted" mean
deleted from a parent's point of view without losing the row while an order printed from
it is still in flight. Anything that must see the row anyway — the purge worker, an
operator looking at why a deletion is stuck — reaches for `raw` and does so knowingly.

Reaching for `raw` in a request handler is almost always a bug: it shows a parent
something they asked to be rid of.

## Account and family

```
User ─┬─ AuthIdentity        (one per provider; email+password is one of them)
      ├─ RefreshToken        (rotating; a reused token invalidates the family)
      ├─ Child ── ChildInterest ── Interest
      ├─ VoiceProfile ── VoiceConsent
      ├─ Story ── StoryPage / StoryVersion / Narration
      ├─ Subscription ── SubscriptionEvent
      ├─ UsageCounter       (the monthly story allowance)
      └─ DeletionRequest
```

`Child` carries both a `birthDate` and an `ageRange`. Either is enough — the band is
derived from the date when one exists, and stands alone when it does not. This is why
`updateChildSchema` allows `birthDate: null`: moving a child from a date back to a band
has to be able to clear the date, or the server would keep deriving the age from a value
the parent had already replaced.

`VoiceConsent` is a separate row rather than a boolean on the profile, because consent
is an event with a time, an IP hash and a recorded scope. A boolean cannot answer "when
did they agree, and to what".

## Story, illustration, book — three things, not one

A `Story` is text. An `IllustrationSet` is images made for that text. A `Book` is a
printable artifact assembled from both — and crucially it *copies* what it needs into
`BookPage` rows rather than pointing at `StoryPage`.

That copy is the reason a parent can fix a typo in a story without disturbing a book
already at the printer, and why `StoryVersion` exists: an edit bumps the story's version
and leaves every narration and order that was built from an earlier one intact.

`Order` holds `RESTRICT` on the book it was printed from — one of only two restrict
relations in the schema. Deleting a book that is being printed would leave a parcel in
the post with nothing behind it, so the account purge deletes terminal orders first and
defers entirely when any order is still in flight.

## Money

`Order`, `Payment`, `PrintProduct` and `ShippingRate` all store integer minor units plus
a `Currency`, never a float. Totals are computed server-side and quoted to the client;
no client anywhere multiplies a unit price by a quantity. `AIUsageLog.costMicros` is a
`BigInt` in millionths for the same reason, which is why the admin dashboard receives it
as a string.

## Jobs and provenance

`AIJob` tracks anything long-running, with `completedSteps`, `totalSteps` and a
`currentStepKey` that is a localization key rather than a sentence. `AIUsageLog` records
what each provider call cost and whether it succeeded — that is what makes AI spend a
number an operator can see today rather than a surprise on an invoice.

`ModerationRecord` keeps the classifier's `verdict` and a human's `reviewOutcome` in
separate columns. The machine's finding is evidence: it is the only way to measure how
often the filter refuses an innocent story, and overwriting it on appeal would erase
exactly the signal worth having.

## Accountability

`AuditLog` has no foreign key to `User`, on purpose. A record of a deletion has to
outlive the account it describes, and a cascade would take the evidence with the
account. `actorType` distinguishes `USER`, `ADMIN` and `SYSTEM`, so a purge run by a
scheduled sweep is as accountable as one an operator triggered.

`DeletionRequest` cascades from `User`. That is correct — the request belongs to the
account — but it has a consequence the purge worker has to respect: once the account
row goes, nothing remains to drive a retry. The `ACCOUNT_PURGED` audit row is therefore
written inside the same transaction as the delete rather than after it.

## Retention

Raw voice-training recordings are kept for a configured window
(`VOICE_RAW_RETENTION_DAYS`, surfaced to the app through `GET /app/config` so the
settings screen quotes the real number). A scheduled sweep purges expired recordings
whether or not anyone asked, and writes an audit row when it does.

## Migrations

```bash
pnpm db:migrate            # create + apply in development
pnpm db:migrate:deploy     # apply in any other environment
pnpm db:seed               # idempotent; interests, system voices, print products
```

Migrations live in `packages/database/prisma/migrations/` and are applied in order. The
seed is upsert-based and safe to re-run; it creates an `AdminUser` only when
`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are both set, and refuses a password under
16 characters when `NODE_ENV=production`.
