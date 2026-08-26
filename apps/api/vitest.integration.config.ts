import { defineConfig } from 'vitest/config';
import { applyTestEnvironment, sharedTestConfig, swcPlugin } from './vitest.shared';

applyTestEnvironment();

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    ...sharedTestConfig,
    include: ['test/**/*.test.ts'],
    // One Postgres and one Redis are shared, so files run serially to keep
    // fixtures from colliding.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
