import path from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Loads the repository-root .env before anything reads process.env.
 *
 * Must be imported first in every entrypoint — the config schema validates at
 * construction time, so a late load would fail the boot it is meant to protect.
 */
export function loadEnvironment(): void {
  loadEnv({ path: path.resolve(__dirname, '../../../.env') });
  loadEnv({ path: path.resolve(__dirname, '../.env'), override: true });
}
