import { execSync } from 'node:child_process';
import path from 'node:path';
import { rmSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp } from '../../src/create-app';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { RedisService } from '../../src/core/redis/redis.service';

let databaseReady = false;

/**
 * Prepares the test database once per run.
 *
 * `migrate deploy` rather than `db push` so the tests exercise the exact
 * migration files that will run in production, then the seed so reference data
 * — interests, system voices, the print catalogue — is present. Those are
 * product configuration the API genuinely depends on, not fixtures.
 */
function ensureDatabase(): void {
  if (databaseReady) return;
  const databasePackage = path.resolve(__dirname, '../../../../packages/database');
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL, APP_ENV: 'test' };

  execSync('pnpm exec prisma migrate deploy', {
    cwd: databasePackage,
    stdio: 'pipe',
    env,
  });
  execSync('pnpm exec tsx prisma/seed.ts', {
    cwd: databasePackage,
    stdio: 'pipe',
    env,
  });
  databaseReady = true;
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
  http: () => request.Agent;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  ensureDatabase();

  const app = await createApp({ withOpenApi: false });
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);

  return {
    app,
    prisma,
    redis,
    http: () => request(app.getHttpServer() as App),
    close: async () => {
      await app.close();
      rmSync(path.resolve(process.cwd(), '.storage-test'), {
        recursive: true,
        force: true,
      });
    },
  };
}

/**
 * Rate-limit counters live in Redis and outlive a database truncate, so they are
 * cleared between tests. Every request in the suite comes from 127.0.0.1 and
 * would otherwise trip the per-IP limits.
 */
export async function resetRateLimits(redis: RedisService): Promise<void> {
  const keys = await redis.client.keys('ratelimit:*');
  if (keys.length > 0) {
    await redis.client.del(...keys);
  }
}

/**
 * Clears user-owned data between tests while leaving reference data (interests,
 * system voices, print catalogue) in place — those are seeded configuration, not
 * fixtures.
 */
export async function resetUserData(prisma: PrismaService): Promise<void> {
  await prisma.raw.$executeRawUnsafe(`
    TRUNCATE TABLE
      users,
      assets,
      ai_jobs,
      idempotency_records,
      moderation_records,
      deletion_requests
    RESTART IDENTITY CASCADE
  `);
}

let emailCounter = 0;

export function uniqueEmail(prefix = 'parent'): string {
  emailCounter += 1;
  return `${prefix}-${emailCounter}-${process.pid}@masalim.test`;
}

export const VALID_PASSWORD = 'masalgecesi7';

export interface SignedUpUser {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function signUp(
  context: TestContext,
  overrides: { email?: string; name?: string } = {},
): Promise<SignedUpUser> {
  const email = overrides.email ?? uniqueEmail();
  const response = await context
    .http()
    .post('/auth/sign-up')
    .send({
      email,
      password: VALID_PASSWORD,
      name: overrides.name ?? 'Ayşe',
      acceptedTerms: true,
    })
    .expect(201);

  const body = response.body as {
    user: { id: string };
    tokens: { accessToken: string; refreshToken: string };
  };

  return {
    userId: body.user.id,
    email,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
  };
}

export function authHeader(user: SignedUpUser): [string, string] {
  return ['authorization', `Bearer ${user.accessToken}`];
}
