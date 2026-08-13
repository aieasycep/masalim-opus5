import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These tests talk to a real PostgreSQL; run them serially so they cannot
    // interfere with each other's fixtures.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
