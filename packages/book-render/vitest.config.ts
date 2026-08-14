import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Chromium launches a real browser process to produce the PDF.
    testTimeout: 60_000,
  },
});
