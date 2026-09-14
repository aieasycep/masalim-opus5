# Postgres on a free managed provider

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



This puts `packages/database/prisma/schema.prisma` onto a hosted Postgres that costs
nothing, for a staging deploy the whole product can be clicked through on. It covers
which provider to pick, how the two connection strings differ and why that difference is
not optional, what happens to Turkish sorting when you leave the collation the provider
gave you, how many connections the API actually opens, what a database that pauses does
to a running API, and how to migrate and seed.

Provider limits below were checked in **August 2026** and they move. Treat every number
as something to re-read on the provider's own pricing page before you rely on it. Nothing
here is free forever; both providers can and do change their free plans.

---

## 1. Which provider

**Use Neon.** Supabase works and is fully documented below, but for this schema Neon wins
on one point that matters more than the rest.

### The deciding argument: Turkish collation

Masalım sorts and searches Turkish titles. Postgres decides how that behaves from the
database's collation, and **a database's collation cannot be changed after it is
created** — that is a Postgres rule, not a provider limitation.

Neon documents creating a database with an ICU locale:

```sql
CREATE DATABASE masalim
  TEMPLATE template0
  LOCALE_PROVIDER icu
  ICU_LOCALE 'tr-TR'
  LOCALE 'C.UTF-8'
  ENCODING 'UTF8';
```

That is the same thing `docker-compose.prod.yml` asks initdb for
(`--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8`), so the managed database
behaves like the compose one. Supabase hands you a `postgres` database that was created
for you, with a libc collation you did not choose, and you cannot re-create it — you are
left pinning individual columns instead (section 6, option B has that migration, and it
works, but it is a thing you must remember to do for every text column that ever gets
ordered or searched).

### The rest of the comparison

|                       | Neon (free plan)                                                         | Supabase (free plan)                                                                  |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Idle behaviour        | Compute suspends after ~5 min, **resumes itself** on the next connection | Project **pauses after 7 days** idle and needs a human to restore it in the dashboard |
| Collation             | Yours to choose at `CREATE DATABASE`                                     | Fixed at project creation; per-column `COLLATE` only                                  |
| Storage               | 0.5 GB per project                                                       | 500 MB                                                                                |
| Compute budget        | ~100 CU-hours per project per month                                      | Always-on until it pauses                                                             |
| Pooled endpoint       | PgBouncer, hostname with `-pooler`                                       | Supavisor, port 6543                                                                  |
| Direct endpoint       | Same hostname without `-pooler`, IPv4                                    | `db.<ref>.supabase.co:5432`, **IPv6 only** on free                                    |
| Session-mode fallback | not needed                                                               | `…pooler.supabase.com:5432`, IPv4                                                     |

Of those figures, only the IPv4 addresses of the Supabase pooler hostnames were measured
directly. The storage caps, the compute budget, the pause windows and the pooler's
backend pool size all come from the providers' published documentation, which is exactly
the sort of thing that changes without anyone telling you.

Two things in that table are worth spelling out.

**Auto-resume versus manual unpause.** A staging box that someone opens once a fortnight
will be idle for more than seven days. On Supabase that means someone has to log into the
dashboard and press restore before the demo works; on Neon the first connection wakes the
compute and the demo just works, a few hundred milliseconds slower. If you are handing a
URL to somebody, that is the difference between "here, try it" and "hang on".

**IPv6.** Supabase's direct endpoint is IPv6-only unless you buy the IPv4 add-on, which
is a Pro-plan feature. Plenty of free application hosts have IPv4-only outbound
networking, and the symptom is `prisma migrate deploy` failing to reach a database that
is demonstrably up. The fix is Supabase's shared **session** pooler on port 5432, which
is IPv4 — `aws-0-eu-central-1.pooler.supabase.com` and `aws-1-eu-central-1.pooler.supabase.com`
both resolve to A records. That is why the Supabase recipe below uses the session pooler
for migrations rather than the direct host.

### What Neon costs you

- The compute suspends after about five minutes of inactivity. The first request after
  that pays a wake. Section 5 covers what that does to a Prisma client with default
  timeouts, and what to set instead.
- The free compute budget is roughly 100 CU-hours per project per month. At Neon's 0.25 CU
  minimum that is about 400 hours of _awake_ time against 730 hours in a month, so you
  cannot keep a free Neon compute awake around the clock. Do not add a keep-alive ping
  and expect it to stay free; take the wake instead.

### Is 0.5 GB enough?

Yes, comfortably. The schema has 45 models and **no binary columns** — the only thing
resembling one is `Asset.sizeBytes`, an `Int`. Media lives in object storage and the
database holds metadata plus story text. A staging box full of clicked-through stories is
tens of megabytes.

---

## 2. The three URLs in the datasource block

The datasource currently reads:

```prisma
datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}
```

Here is what each of those is actually used for, checked by running Prisma 6.19.3 against
deliberately unreachable hosts and reading which one it dialled:

| Field               | Read by                                                                        | Verified behaviour                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`               | Prisma Client at runtime; the schema engine when no `directUrl` exists         | `new PrismaClient()` connects here and nothing else. With `DIRECT_DATABASE_URL` absent the client constructed fine and failed only with `P1001` against the `url` host.           |
| `directUrl`         | The schema engine only — `migrate deploy`, `migrate dev`, `db push`, `db pull` | Not declared today. With it declared, `migrate deploy` dialled the `directUrl` host and ignored `url` entirely.                                                                   |
| `shadowDatabaseUrl` | `migrate dev` and `migrate diff` when they need a scratch database             | `migrate deploy` never asks for it: with `SHADOW_DATABASE_URL` unset, deploy got as far as `P1001` on the real host. You do **not** need a shadow database on the managed server. |

`prisma generate` needs none of the three — it ran clean with all three unset, so a build
step that only generates the client never needs database credentials.

### Why migrations cannot go through the transaction pooler

The schema engine takes a **session-level advisory lock** before it touches anything. The
exact statement is compiled into the engine binary:

```
SELECT pg_advisory_lock(72707369)
```

with the matching error string _"Timed out trying to acquire a postgres advisory lock"_.
A session-level lock lives on one backend connection. A transaction pooler hands your
next statement to whichever backend is free, so the connection holding the lock is not
the connection running the migration. That is the whole reason a pooled URL cannot run
migrations — it is not a Prisma quirk, it is what transaction pooling means.

(The engine honours `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK`. Do not reach for it. The lock
is what stops two deploys applying the same migration at once.)

### The decision: no `directUrl`, and here is why

**Do not add `directUrl` to the schema.** Point `DATABASE_URL` at the pooled URL for the
running app, and set `DATABASE_URL` to the direct URL for the one command that applies
migrations.

The reason is a verified failure mode: **once `directUrl` is declared, its environment
variable becomes mandatory for every schema-engine command**, before any network call.
With the field declared and `DIRECT_DATABASE_URL` unset, `prisma migrate deploy` dies
with:

```
Error code: P1012
error: Environment variable not found: DIRECT_DATABASE_URL.
```

Three existing paths would break the moment that field lands:

- `pnpm db:migrate` on any developer's laptop, because the repo-root `.env` has no such
  variable.
- The `migrate` service in `docker-compose.prod.yml`, whose `environment:` block passes
  `DATABASE_URL` and nothing else.
- Any CI job that runs a schema-engine command.

None of those has a pooler in front of it, so none of them gains anything from the field.
Overriding one variable for one command is cheaper than making a variable required
everywhere to serve a case that only applies to managed Postgres.

### If you decide to add it anyway

It is a defensible choice — it makes the pooled/direct split explicit in the schema and
removes the chance of someone running migrations through the pooler by accident. It is
just not free. The complete set of changes:

1. `packages/database/prisma/schema.prisma`, in the datasource block:

   ```prisma
   directUrl = env("DIRECT_DATABASE_URL")
   ```

2. `.env` and `.env.example` (repo root) — required, or every local `pnpm db:migrate`
   fails `P1012`. In development there is no pooler, so it is the same value as
   `DATABASE_URL`:

   ```
   DIRECT_DATABASE_URL=postgresql://masalim:masalim@localhost:5432/masalim?schema=public
   ```

3. `.env.deploy.example` — a `DIRECT_DATABASE_URL=` entry alongside `DATABASE_URL`.

4. `docker-compose.prod.yml`, under the `migrate` service's `environment:` key:

   ```yaml
   DIRECT_DATABASE_URL: ${DIRECT_DATABASE_URL}
   ```

5. `apps/api/src/core/config/config.schema.ts` — **nothing**. The runtime client never
   reads `directUrl` (verified: with the variable absent, the client still constructed and
   dialled the `url` host), and `envSchema` is a plain `z.object`, which strips unknown keys rather than
   rejecting them, so the extra variable sitting in the process environment is harmless.

---

## 3. The connection strings

Start from the string the provider's dashboard gives you — it already carries the right
host, user, password and TLS parameters — and append the query parameters below. Do not
retype the host; the region prefix varies per project.

### Neon

```
# The application. Pooled: hostname contains -pooler.
DATABASE_URL=postgresql://USER:PASSWORD@ep-EXAMPLE-pooler.eu-central-1.aws.neon.tech/masalim?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=20&connect_timeout=15&schema=public

# Migrations and seeding only. Same host without -pooler.
postgresql://USER:PASSWORD@ep-EXAMPLE.eu-central-1.aws.neon.tech/masalim?sslmode=require&connect_timeout=30&schema=public
```

### Supabase

```
# The application. Transaction pooler, port 6543.
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=20&connect_timeout=15&schema=public

# Migrations and seeding only. Session pooler, port 5432 — same hostname, different port.
postgresql://postgres.PROJECTREF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30&schema=public
```

Session mode gives each client its own backend connection for the life of the session, so
the advisory lock holds. The direct host (`db.PROJECTREF.supabase.co:5432`) also works if
your machine has IPv6.

### What each parameter does

- **`pgbouncer=true`** — pooled URL only. Puts Prisma's engine into its PgBouncer mode:
  it stops using named prepared statements, which a transaction pooler cannot keep
  associated with your session. Without it you get sporadic _"prepared statement
  already exists"_ failures under concurrency. Never put it on the migration URL.
- **`connection_limit=5`** — see section 4. Set it; do not take the default.
- **`pool_timeout=20`** — how long a query waits for a free connection from Prisma's own
  pool before failing with `P2024`. Default is 10s; a cold database plus a queue can beat
  that.
- **`connect_timeout=15`** (30 for migrations) — how long opening a new connection may
  take. Default is 5s, which a suspended compute can exceed while it wakes.
- **`sslmode=require`** — both providers terminate TLS; Prisma's default is `prefer`.
- **`schema=public`** — matches the existing `DATABASE_URL` in `.env.deploy.example`.

---

## 4. Connections: what the API actually opens

`PrismaService` builds **two** clients:

```ts
this.client = createPrismaClient(options); // soft-delete extension
this.raw = createRawPrismaClient(options); // unfiltered
```

Both factories call `new PrismaClient(...)` (`packages/database/src/client.ts`, lines 218
and 266). The extension on `client` is a query wrapper, not a second engine — but `raw`
is a genuinely separate `PrismaClient`. **Two engines, two independent pools, per
process.**

Prisma's default pool size is `num_physical_cpus * 2 + 1` _per client_. Two problems with
leaving that alone on a free host:

- It is per client, so the process opens twice what you would guess.
- The engine counts the host's cores, not the container's CPU share. A 0.1-CPU free
  instance scheduled on a 16-core machine can compute a pool size of 33 — twice — and try
  to open 66 connections to a database that allows a fraction of that.

With `connection_limit=5` and `MASALIM_ROLE=all` (one process doing HTTP and jobs), the
deploy opens at most **10** connections. That fits inside Supabase's Nano-size Supavisor
pool of roughly 15 backend connections with headroom to spare, and is nowhere near
Neon's pooler ceiling.

**If you run the API and the worker as two processes** instead of one `MASALIM_ROLE=all`
process, that is four clients and 20 connections — over the Supabase pooler's backend
pool. Either halve `connection_limit` to 2 or run the single combined process.

One more thing sets the real ceiling. The API uses interactive transactions heavily —
twenty call sites, in orders, payments, stories, children, entitlements and account
deletion — and **none of them pass a timeout**, so all of them run on Prisma's
defaults of 2s `maxWait` and 5s `timeout`. Through a transaction pooler an interactive
transaction pins a backend connection for its whole duration. Ten concurrent
transactions is the practical concurrency limit of this deploy. For staging that is far
more than enough; it is worth knowing before someone load-tests it and blames the pooler.

---

## 5. What happens when the database pauses

Both free tiers stop the database when nobody is using it. They stop it differently, and
the difference is what you will actually experience.

### Neon: suspends after ~5 minutes, resumes itself

No manual step. The cost is that the first connection after idle waits for the compute to
start. Two defaults get in the way:

- `connect_timeout` is 5 seconds. A cold start can exceed it, and the request fails with
  a `PrismaClientInitializationError` / `P1001` that reads like the database is down when
  it is merely waking.
- Interactive transactions wait 2 seconds (`maxWait`) to acquire a connection before
  failing with `P2024`, and no call site in the API raises that.

So set `connect_timeout=15` and `pool_timeout=20` on the pooled URL, as in section 3.
That converts almost every wake from a 500 into a slow first request.

Do not "fix" this with a cron ping. Keeping the compute awake 24/7 needs about 730 CU-hours
a month against a free budget of roughly 100.

### Supabase: pauses after 7 days, needs a human

After seven days with no activity the project is paused. Data, tables and extensions are
preserved; the database is simply not there until someone restores it from the dashboard.
Any request resets the seven-day clock, so a project in daily use never pauses.

What the API does while paused is worth knowing, because it is not a crash:

- `GET /health` is a bare liveness check that returns `{status: 'ok'}` without touching
  anything, so the host's health check keeps passing and the process is not restarted.
- `GET /health/ready` runs `SELECT 1` through `prisma.raw` and reports
  `database: down` with the driver's error, `redis: up`, and an overall status of
  `degraded`.
- Every request that reads or writes data returns a 5xx.

That is the right shape — you get a live process telling you exactly what is wrong rather
than a restart loop — but it means nothing self-heals. Point an uptime check at
`/health/ready` and alert on `degraded`, or accept that you will discover it by opening
the app.

---

## 6. Turkish collation

`docker-compose.prod.yml` initialises its Postgres with:

```yaml
POSTGRES_INITDB_ARGS: '--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8'
```

Managed providers do not run initdb for you, so you get their default. Neon's own
compatibility documentation states `C.UTF-8`. Supabase's is reported as a libc
`en_US.UTF-8` — that one comes from their documentation and issue tracker rather than
from a project measured here, so check whichever you end up on rather than trusting this
paragraph:

```sql
SELECT datcollate, datctype, datlocprovider, daticulocale
  FROM pg_database WHERE datname = current_database();
```

`datlocprovider` is `c` for libc and `i` for ICU. On Postgres 17 and later the last
column was renamed to `datlocale`, so swap the name if that query errors — or just run
`\l` in psql, which prints the same thing on every version.

### What actually breaks

This is not theoretical. Sorting the same Turkish titles under three collations, run
against Postgres 16:

```
C.UTF-8      Gökyüzü < Güneş < Ilgaz < Ismail < Orman < Sevgi < Uçurtma < Zeytin
             < Çınar < Ördek < Ütopya < İlkbahar < Şeker
en-US-x-icu  Çınar < Gökyüzü < Güneş < Ilgaz < İlkbahar < Ismail < Ördek < Orman
             < Şeker < Sevgi < Uçurtma < Ütopya < Zeytin
tr-TR-x-icu  Çınar < Gökyüzü < Güneş < Ilgaz < Ismail < İlkbahar < Orman < Ördek
             < Sevgi < Şeker < Uçurtma < Ütopya < Zeytin
```

Under `C.UTF-8` every Turkish-specific letter sorts after `Z`, because the comparison is
byte order. A parent scrolling an alphabetical library finds _Çınar_, _Ördek_ and _Şeker_
dumped in a heap below _Zeytin_. That is not a rough edge; it looks like the list is
broken.

`en-US-x-icu` is closer, and wrong in three places above. The Turkish alphabet treats
ç, ğ, ı, ö, ş and ü as **separate letters** with their own positions — `c < ç`, `o < ö`,
`s < ş`, `u < ü`, and dotless `ı` before dotted `i`. English collation folds them onto
their base letters, so you get `Ördek < Orman`, `Şeker < Sevgi` and `İlkbahar < Ismail`,
all three backwards for a Turkish reader. Reaching for an English ICU collation because
it is "close enough" buys you most of the fix and a bug that is much harder to notice.

### The part that bites today

Grep the API and no query orders by a Turkish text column — every `orderBy` is
`createdAt`, `pageNumber`, `updatedAt`, `sortOrder`, `scheduledFor` or an ASCII `key`. So
the sort damage above is latent: it lands the day someone adds `orderBy: { title: 'asc' }`
to the library.

What is live right now is **search**. `StoriesService.list` filters with:

```ts
{ title: { contains: input.search, mode: 'insensitive' } }
```

Prisma compiles `mode: 'insensitive'` to `ILIKE` on Postgres, and `ILIKE` folds case using
the collation's rules. Turkish case mapping is not English case mapping: `lower('IRMAK')`
is `ırmak` in Turkish and `irmak` everywhere else. Measured on real columns:

```
column collation      query          rows
--------------------  -------------  ----
(C.UTF-8 default)     ILIKE %ırmak%   0
tr-TR-x-icu           ILIKE %ırmak%   1
```

A parent searching _ırmak_ for a story called _IRMAK_ gets an empty library and concludes
the search is broken. `İstanbul` matched `istanbul` under both, so it is specifically
capital-I words that vanish — which in Turkish is a lot of them.

### Option A — create the database with ICU (Neon; preferred)

Best answer where you control `CREATE DATABASE`. Run once, before any migration, from
the Neon SQL editor or psql connected to the default database:

```sql
CREATE DATABASE masalim
  TEMPLATE template0
  LOCALE_PROVIDER icu
  ICU_LOCALE 'tr-TR'
  LOCALE 'C.UTF-8'
  ENCODING 'UTF8';
```

Then point both URLs at `/masalim` instead of the provider's default database name. Every
text column inherits Turkish collation with no per-column work and no `COLLATE` clauses in
any query.

`LOCALE 'C.UTF-8'` only sets the libc `LC_COLLATE`/`LC_CTYPE` that Postgres still requires
alongside the ICU locale; if a provider rejects it, drop that one line and the values are
inherited from `template0`. The `ICU_LOCALE` line is the one that matters.

Verified end to end on Postgres 16: all four migrations in
`packages/database/prisma/migrations/` apply cleanly to a database created this way,
`ORDER BY title` with no explicit collation returns
`Çınar < Ilgaz < Ismail < İlkbahar < Orman < Ördek < Sevgi < Şeker < Zeytin`, and
`prisma migrate diff` against the datamodel reports **no difference** — the ICU database
is not drift.

Postgres cannot change a database's collation afterwards, so this has to happen before
you migrate.

### Option B — pin the columns (Supabase, or any provider where option A is closed)

Every server built with ICU support already carries predefined ICU collations in
`pg_catalog`; no `CREATE COLLATION` is needed. Confirm first:

```sql
SELECT collname FROM pg_collation WHERE collname = 'tr-TR-x-icu';
```

Then add a hand-written migration —
`packages/database/prisma/migrations/<timestamp>_turkish_collation/migration.sql`:

```sql
ALTER TABLE stories  ALTER COLUMN title TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE children ALTER COLUMN name  TYPE text COLLATE "tr-TR-x-icu";
```

(Table names are the `@@map`ped snake_case ones, not the Prisma model names.)

Verified: those statements apply to a fully migrated database, `information_schema.columns`
then reports `stories.title -> tr-TR-x-icu`, search for `ırmak` starts matching `IRMAK`,
and `ORDER BY` on that column returns Turkish order.

Collation is not expressible in Prisma's schema language, and `prisma migrate diff`
reported **no difference** after the `ALTER` — so this change is invisible to drift
detection. That cuts both ways: it will not fight the schema, and it will also not be
recreated by anything Prisma generates. Keeping it in a migration file is what makes it
survive onto the next fresh database.

Extend the list to any column you later sort or search on.

### Option C — accept it

Legitimate for a staging box running mock providers, as long as it is a decision. Write it
down and fix it before a real Turkish parent sees the library.

---

## 7. Migrating

Migrations must run against the **direct or session** URL, for the advisory-lock reason in
section 2. From a full workspace checkout:

```bash
DATABASE_URL='<the migration URL from section 3>' pnpm db:migrate:deploy
```

That runs `prisma migrate deploy` inside `packages/database`. Notes:

- `packages/database/prisma.config.ts` loads the repo-root `.env` without `override`, and
  dotenv does not overwrite a variable already present in the environment — so the value
  you put on the command line wins. Prefixing the command is enough; you do not need to
  edit any file. **The one exception**: it then loads `packages/database/.env` _with_
  `override: true`. If that file exists on the machine you are running from, it beats your
  command line and you will migrate whatever it points at. Check for it before you assume
  where the migration landed.
- The command is idempotent. It applies whatever is in
  `packages/database/prisma/migrations/` and is not yet in `_prisma_migrations`.
- `SHADOW_DATABASE_URL` is not needed and not consulted (verified). Only `migrate dev`
  wants a shadow database, and you should be creating migrations locally, never against
  the managed server.
- If it hangs and then reports a timeout acquiring an advisory lock, you pointed it at the
  transaction pooler. Use the session pooler or the direct host.

The `migrate` target in the `Dockerfile` runs the same command. That image has never been
built in this repository, so prefer running the command from a checkout until someone has
built and run it.

---

## 8. Seeding

```bash
DATABASE_URL='<the migration URL>' \
APP_ENV=staging \
ADMIN_SEED_EMAIL='you@example.com' \
ADMIN_SEED_PASSWORD='<a long random string>' \
pnpm db:seed
```

`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are read straight from `process.env` by
`packages/database/prisma/seed.ts`; they are deliberately not in
`apps/api/src/core/config/config.schema.ts` because the API never reads them, and they
already appear in `.env.deploy.example`. Omit them and the seed logs that it skipped the
admin user and carries on.

Everything the seed writes is an upsert, so it is safe to re-run after every deploy.

### Read this before you run it on a public URL

The seed branches on `APP_ENV`, and it treats **only** `production` as production:

```ts
const isProduction = process.env.APP_ENV === 'production';
```

A free-tier deploy runs `APP_ENV=staging`, which means `seedDemoContent()` runs and the
database gets two demo parent accounts — `ayse@masalim.local` and `mehmet@masalim.local`
— both with the password `masalim-demo-2026`, hard-coded in the seed and therefore in the
repository. Also two children, several ready stories, two voice profiles and an address.

On a staging box reachable from the internet, that is two accounts with a published
password. Choose deliberately:

- **Keep the demo content** if clicking through a populated library is the point. It is,
  usually — that is what the free deploy is for. Just do not put anything real in there.
- **Skip it** by running the seed alone with `APP_ENV=production`, which seeds reference
  data and the admin user and nothing else. That branch also refuses an
  `ADMIN_SEED_PASSWORD` shorter than 16 characters. Setting `APP_ENV=production` for this
  one command does not affect the running API, which reads its own environment.

Either way the reference data — 12 interests, the system voices, print products, shipping
rates, feature flags and app version policies — is seeded, and the app needs it.

### Where to run it from

Not from the deployed runtime image. The seed is `tsx prisma/seed.ts` and it hashes
passwords with `argon2`, both of which are devDependencies with a native build step. Run
it from a full workspace install — your laptop or a CI job — with `DATABASE_URL` pointed
at the managed database.

The seed opens a plain `new PrismaClient()` and does sequential upserts with no
interactive transactions, so the pooled URL would also work. Use the migration URL anyway,
so that everything schema-shaped goes through one connection string.

---

## 9. Checklist

1. Create the project. On Neon, create the database with `LOCALE_PROVIDER icu` and
   `ICU_LOCALE 'tr-TR'` **before** anything else (section 6, option A).
2. Copy both connection strings out of the dashboard; append the parameters from
   section 3. Pooled one goes in `DATABASE_URL` for the app; keep the direct one
   somewhere for migrations.
3. `DATABASE_URL='<direct>' pnpm db:migrate:deploy`.
4. On Supabase, apply the column collation migration (section 6, option B).
5. `DATABASE_URL='<direct>' APP_ENV=… pnpm db:seed`, having decided about the demo
   accounts.
6. Deploy the API with the **pooled** `DATABASE_URL` and `MASALIM_ROLE=all`.
7. `curl https://your-api/health/ready` and confirm `database: up`.
