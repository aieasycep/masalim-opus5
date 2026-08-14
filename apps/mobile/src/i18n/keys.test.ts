import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@masalim/types';
import { createTranslator } from '@masalim/localization';

const ROOTS = [path.resolve(__dirname, '../../app'), path.resolve(__dirname, '..')];

/**
 * Literal `t('…')` calls. Dynamic keys — `t(job.currentStepKey)`,
 * `t(interest.labelKey)` — are intentionally out of scope here: those come from
 * the server, and the localisation package has its own coverage test for the
 * key sets it publishes.
 */
const LITERAL_KEY = /\bt\(\s*'([a-zA-Z][\w.]*)'/g;

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'dist') continue;
      files.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(full);
    }
  }

  return files;
}

function usedKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>();

  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(LITERAL_KEY)) {
        const key = match[1];
        if (!key) continue;
        const users = keys.get(key) ?? [];
        users.push(path.basename(file));
        keys.set(key, users);
      }
    }
  }

  return keys;
}

/**
 * Every string the app asks for must exist in every locale.
 *
 * `t` takes a plain string, so a typo or a key that was renamed in the catalogue
 * compiles perfectly and ships a raw `home.gretingEvening` to a parent. This is
 * the test that catches it — and it also catches a key added to Turkish but
 * forgotten in English, which is the more common failure.
 */
describe('localisation keys used by the app', () => {
  const keys = [...usedKeys().entries()];

  it('finds keys to check', () => {
    expect(keys.length).toBeGreaterThan(40);
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const translator = createTranslator(locale);

      it.each(keys)('resolves %s', (key) => {
        const value = translator.t(key);
        // The translator echoes the key back when it finds nothing.
        expect(value, `missing "${key}" in ${locale}`).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(0);
      });
    });
  }
});
