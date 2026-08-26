# The REST surface

The API is a NestJS application in `apps/api`. Everything below is true of the code
rather than of an intention: routes come from the controllers in
`apps/api/src/modules/*/`, and the shapes come from `@masalim/types` and
`@masalim/validation`, which both the API and the clients import.

## The contract

Two packages hold the contract, deliberately split:

- **`@masalim/types`** — DTO interfaces, enum tuples, `ERROR_CODES`. No runtime
  dependencies at all, so anything can import it: the mobile app, the console, the
  database package, the API.
- **`@masalim/validation`** — the zod schemas. Request bodies and query strings are
  parsed with these, and the clients import the *same* schemas to validate before
  sending. A limit therefore exists once. When a form needs to know how many interests
  a child may have, it reads that number off `createChildSchema` rather than declaring
  its own (see `apps/mobile/src/lib/child-form.ts`).

Validation runs through `zodBody()` / `zodQuery()` from
`apps/api/src/core/http/zod-validation.pipe.ts`. A schema failure becomes a 422 whose
`details` name the offending fields.

## Every error looks the same

`apps/api/src/core/errors/exception.filter.ts` catches everything and emits exactly one
shape:

```json
{
  "error": {
    "code": "STORY_LIMIT_REACHED",
    "message": "…",
    "requestId": "01J…",
    "details": { }
  }
}
```

`code` is from `ERROR_CODES` in `packages/types/src/error-codes.ts` and is what clients
branch on — never the message, and never the HTTP status alone. `requestId` is the same
id written into the server log line for that request, so a screenshot from a parent is
enough to find what happened.

`details` appears only when it carries something actionable (field-level validation
errors). Stack traces are logged, never returned.

The mobile app maps `code` to Turkish copy in its `errorCopy` helper; an unmapped code
falls back to a general message rather than showing the raw code, because a code on
screen at bedtime helps nobody.

## Authentication

Two populations, two token types, and they do not interoperate:

| | Parents | Operators |
| --- | --- | --- |
| Table | `User` | `AdminUser` |
| Guard | `JwtAuthGuard` (global) | `AdminAuthGuard` (per-route) |
| Claim | `typ: access` | `typ: admin`, audience `masalim-admin` |
| Signing key | `JWT_ACCESS_SECRET` | derived from it, not equal to it |
| Refresh | rotating refresh tokens | none — sign in again |

`JwtAuthGuard` is registered globally, so a route is protected unless it is marked
`@Public()`. Admin controllers are marked `@Public()` only to stand the parent guard
down; `AdminAuthGuard` then runs in its place. The effect is that forgetting a decorator
closes a route rather than opening it.

Entitlements are a second guard (`EntitlementGuard`) running after authentication, which
is what makes a premium boundary a server fact rather than a UI convention. The client
shows a lock; the server is what enforces it.

## Idempotency

Anything that costs money or provider credits takes an `idempotencyKey` in its body — a
UUID the client generates once and reuses across retries. `IdempotencyInterceptor` and
the `IdempotencyRecord` table make the second attempt return the first attempt's result
rather than starting a second generation or a second charge. This is why the checkout
draft holds one key for the life of the draft instead of minting one per tap.

## Long work is a job, not a request

Story generation, narration, illustration and book rendering all take longer than a
request should. Those endpoints return an `AIJobDto` immediately and the work continues
on a queue. The client follows progress with `watchJob` from `@masalim/api-client`,
which reports the job's real `completedSteps / totalSteps` and its `currentStepKey` —
a localization key, so the server decides what the step is called and the client decides
what language to say it in.

A job that fails carries an `errorCode` from the same `ERROR_CODES` set, so a failed job
and a failed request are handled by identical client code.

## Pagination

List endpoints are cursor-based and return `Paginated<T>`: `items`, plus `nextCursor`
when there is more. Offsets were avoided because the lists that matter here — a
library, a moderation queue — change under the reader.

## Route map

Public and parent-facing routes live in `apps/api/src/modules/`:

| Area | Module |
| --- | --- |
| Sign-up, sign-in, refresh, password reset | `auth` |
| Account, preferences, deletion requests | `users` |
| Child profiles and the interest catalogue | `children` |
| Story creation, editing, favourites, progress | `stories` |
| Voice recording, consent, cloning | `voices` |
| Narration | `narration` |
| Illustration sets and variants | `illustrations` |
| Books, pages, renders | `books` |
| Plans, entitlements, purchases | `subscriptions` |
| Addresses | `addresses` |
| Quotes, orders, payment callbacks | `orders` |
| Notifications and device tokens | `notifications` |
| Job status | `jobs` |
| Remote config and version policy | `app-config` |
| Signed upload URLs | `assets` |
| Health and readiness | `health` |
| Operator console | `admin` |

The console's own surface is documented in `apps/api/src/modules/admin/admin.module.ts`,
whose top comment carries the role split and the audit obligations.

## OpenAPI

Swagger is generated from the decorators and served in non-production environments.
`@ApiTags` groups by module and `@ApiOperation` carries the one-line summary. It is
generated documentation, so it is accurate about routes and their auth requirements but
defers to `@masalim/validation` for the exact body shapes.
