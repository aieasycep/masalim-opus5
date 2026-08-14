import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ffmpeg runs as a child process on real files; the default 5s is tight.
    testTimeout: 30_000,
  },
});
