import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * The repo `.env` carries `CHROMIUM_EXECUTABLE_PATH` for images that already ship
 * a browser. Loading it here means a developer configures it once, rather than
 * discovering that the API suite finds Chromium and this one does not.
 */
loadEnv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Chromium launches a real browser process to produce the PDF.
    testTimeout: 60_000,
  },
});
