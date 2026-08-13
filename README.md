# Masalım

Kişiselleştirilmiş çocuk masalları. Ebeveynler yapay zekâ yardımıyla çocuklarına özel hikâyeler
oluşturur, kendi sesleriyle seslendirir, resimlendirir ve dilerlerse gerçek bir kitap olarak bastırır.

> **Sen yanında olamasan bile sesin onunla.**

Türkiye pazarı için geliştirilmiştir; mimari ve yerelleştirme altyapısı global kullanıma hazırdır.

---

## What this is

A production-grade full-stack application, not a design prototype:

- **React Native (Expo)** mobile app
- **NestJS** API with PostgreSQL, Redis-backed job queues and S3-compatible storage
- **Next.js** admin panel with its own role-based auth
- Provider-agnostic AI layer: story generation, content safety, illustration, text-to-speech and
  parent voice cloning
- Subscriptions, entitlements, physical book ordering and payments

Every external provider sits behind an interface with a complete mock, so **the entire application
runs end-to-end without a single API key**.

---

## Repository layout

```
apps/
  mobile/     Expo + Expo Router + TypeScript
  api/        NestJS + Prisma + BullMQ (HTTP and worker entrypoints)
  admin/      Next.js App Router admin panel
packages/
  types/          domain enums, error codes, entitlements, story rules
  validation/     Zod schemas shared by API and mobile
  config/         TypeScript / ESLint / Prettier presets
  ui/             design tokens and the React Native component system
  localization/   tr + en message catalogues
  api-client/     typed API client and TanStack Query hooks
  ai/             story, image, TTS and voice-clone providers
  storage/        object storage providers and signed URLs
  payments/       payment, subscription and print providers
  notifications/  push notification providers
  analytics/      analytics providers and the event registry
  database/       Prisma schema, migrations and seed data
docs/           architecture, providers, database and API documentation
```

---

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | 22+ |
| pnpm | 10+ |
| PostgreSQL | 16 |
| Redis | 7 |
| Docker (optional) | for `docker compose` infrastructure |

---

## Local setup

```bash
pnpm install
cp .env.example .env

# PostgreSQL + Redis (+ MinIO when Docker is available)
pnpm infra:up

pnpm db:migrate
pnpm db:seed
```

`pnpm infra:up` prefers Docker Compose. On machines with the Docker CLI but no reachable daemon it
transparently falls back to natively installed PostgreSQL and Redis, creating a cluster under
`.dev-infra/`. Either way the connection strings in `.env.example` keep working.

### Running

```bash
pnpm dev:api      # http://localhost:3000  (OpenAPI at /docs)
pnpm dev:worker   # background job worker
pnpm dev:admin    # http://localhost:3001
pnpm dev:mobile   # Expo dev client
```

### Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

---

## Mock providers

With `.env.example` copied as-is, every provider resolves to its mock:

```
AI_PROVIDER=mock            MODERATION_PROVIDER=mock
IMAGE_PROVIDER=mock         TTS_PROVIDER=mock
VOICE_CLONE_PROVIDER=mock   PAYMENT_PROVIDER=mock
SUBSCRIPTION_PROVIDER=mock  PRINT_PROVIDER=mock
PUSH_PROVIDER=mock          STORAGE_PROVIDER=local
```

Mocks are complete, not stubs: they produce real story JSON, real audio files, real images and real
payment state transitions, so all three critical user journeys work offline.

Mocks refuse to load when `APP_ENV=production`, so a production build can never silently ship one.

Swapping in a real provider is a single environment variable plus its credentials — see
[`docs/providers.md`](docs/providers.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | System architecture and data flow |
| [`docs/providers.md`](docs/providers.md) | Every provider interface and how to activate the real one |
| [`docs/database.md`](docs/database.md) | Entity relationships and schema notes |
| [`docs/api.md`](docs/api.md) | REST surface and error format |
| [`docs/design-system.md`](docs/design-system.md) | Design tokens and component inventory |

---

## Licence

Proprietary. All rights reserved.
