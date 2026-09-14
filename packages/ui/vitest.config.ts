import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Token-level tests only; component rendering is covered by the mobile app's
    // React Native Testing Library suite.
    include: ['src/**/*.test.ts'],
  },
});
