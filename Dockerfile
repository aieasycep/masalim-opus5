# Masalım — API, worker and operator console in one build.
#
# Debian rather than Alpine on purpose. Prisma ships a native query engine per
# libc/OpenSSL combination and Playwright's Chromium expects glibc; running
# either on musl means either a second set of binaries or a runtime failure at
# the first query. The size difference is not worth that.
#
# Three runnable targets come out of one builder:
#
#   api      — the HTTP process. No browser.
#   worker   — the queue process. Ships Chromium, because rendering a book to
#              PDF is queued work and only this process does it.
#   admin    — the Next.js operator console.
#
# The split matters: Chromium is most of the image weight, and putting it in the
# HTTP container would triple the size of the thing that scales horizontally.

# ---------------------------------------------------------------- base
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Prisma's engine needs OpenSSL present at runtime, not just at build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- deps
#
# Manifests first, source second. An edit to a screen then reuses the install
# layer instead of resolving the whole workspace again.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/ai/package.json ./packages/ai/
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/audio/package.json ./packages/audio/
COPY packages/book-render/package.json ./packages/book-render/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/localization/package.json ./packages/localization/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/payments/package.json ./packages/payments/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validation/package.json ./packages/validation/
# The browser download is skipped here and installed per-target below, so the
# api image never carries one.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=@masalim/api --filter=@masalim/admin

# ------------------------------------------------------------ api runtime
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

# Runs as a non-root user; nothing here needs to write outside /tmp.
RUN chown -R node:node /app
USER node

EXPOSE 3000
# Readiness rather than liveness, and the body rather than the status code:
# /health/ready answers 200 whether or not its probes passed, reporting
# "degraded" in the payload instead of failing the request. Checking `r.ok`
# would therefore call a container healthy while its database was unreachable,
# and an orchestrator would route traffic straight at it.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]

# --------------------------------------------------------- worker runtime
FROM base AS worker
ENV NODE_ENV=production
# Chromium from Debian rather than Playwright's download: the renderer already
# honours CHROMIUM_EXECUTABLE_PATH precisely so the image can ship its own and
# not depend on Playwright's exact build revision.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

RUN chown -R node:node /app
USER node
WORKDIR /app/apps/api
CMD ["node", "dist/main.worker.js"]

# ---------------------------------------------------------- admin runtime
FROM base AS admin
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/admin ./apps/admin

RUN chown -R node:node /app
USER node
EXPOSE 3001
WORKDIR /app/apps/admin
CMD ["node_modules/.bin/next", "start", "--port", "3001"]

# -------------------------------------------------------- migration runner
#
# A one-shot target rather than something the API does at start-up. Two API
# replicas booting at once would otherwise race the same migration, and a failed
# migration would look like a failed deploy of the application.
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
WORKDIR /app/packages/database
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
