import { describe, expect, it } from 'vitest';
import { LOCALES, NOTIFICATION_TYPES, type Locale } from '@masalim/types';
import { createTranslator } from './translator';

/**
 * Keys the backend hands to the client as bare strings.
 *
 * These are the ones a type checker cannot protect: a job publishes
 * `job.book.saving` as a progress label and a notification publishes
 * `notification.storyReady.title`, and if the catalogue has no entry the parent
 * sees the raw key — or, worse, an empty progress bar with no label at all.
 *
 * Every key here is emitted by a service in apps/api. Adding a pipeline step
 * means adding its copy, and this test is what says so.
 */
const JOB_STEP_KEYS = [
  'job.story.queued',
  'job.story.writing',
  'job.story.checking',
  'job.story.saving',
  'job.voice.queued',
  'job.voice.analysing',
  'job.voice.cloning',
  'job.voice.preview',
  'job.voice.finishing',
  'job.narration.queued',
  'job.narration.preparing',
  'job.narration.synthesising',
  'job.narration.assembling',
  'job.narration.saving',
  'job.illustration.queued',
  'job.illustration.character',
  'job.illustration.cover',
  'job.illustration.page',
  'job.book.queued',
  'job.book.gathering',
  'job.book.rendering',
  'job.book.saving',
  'job.print.queued',
  'job.print.rendering',
] as const;

const HOME_GREETING_KEYS = [
  'home.greetingMorning',
  'home.greetingAfternoon',
  'home.greetingEvening',
] as const;

/** `STORY_READY` → `storyReady`, matching how the catalogue is keyed. */
function notificationKeyFor(type: string): string {
  return type
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function resolves(locale: Locale, key: string): boolean {
  const value = createTranslator(locale).t(key);
  // The translator falls back to the key itself when nothing is found.
  return value !== key && value.trim().length > 0;
}

describe('message coverage', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      it.each(JOB_STEP_KEYS)('has copy for %s', (key) => {
        expect(resolves(locale, key)).toBe(true);
      });

      it.each(HOME_GREETING_KEYS)('has copy for %s', (key) => {
        expect(resolves(locale, key)).toBe(true);
      });

      it.each(NOTIFICATION_TYPES)('has a title and body for %s', (type) => {
        const base = `notification.${notificationKeyFor(type)}`;
        expect(resolves(locale, `${base}.title`)).toBe(true);
        expect(resolves(locale, `${base}.body`)).toBe(true);
      });
    });
  }
});
