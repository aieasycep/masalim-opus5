import { defineConfig } from 'vitest/config';
import { applyTestEnvironment, sharedTestConfig, swcPlugin } from './vitest.shared';

applyTestEnvironment();

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    ...sharedTestConfig,
    include: ['src/**/*.test.ts'],
  },
});
