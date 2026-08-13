import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import swc from 'unplugin-swc';
import type { UserConfig } from 'vitest/config';

loadEnv({ path: path.resolve(__dirname, '../../.env') });

/**
 * Tests always run against a throwaway database and storage directory, so a
 * failing run can never touch development data.
 */
export function applyTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.APP_ENV = 'development';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://masalim:masalim@localhost:5432/masalim_test?schema=public';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.STORAGE_LOCAL_DIR = '.storage-test';
}

/**
 * Nest's DI reads `design:paramtypes`, which esbuild does not emit. SWC does, so
 * the tests exercise the same container wiring the application uses.
 */
export const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

export const sharedTestConfig: UserConfig['test'] = {
  globals: false,
  environment: 'node',
};
