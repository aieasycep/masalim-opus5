import { describe, expect, it } from 'vitest';
import {
  AGE_BAND_RULES,
  AGE_RANGES,
  DURATION_RULES,
  STORY_DURATIONS,
  ageRangeFromAge,
  resolvePageCount,
  TURKISH_NARRATION_WORDS_PER_MINUTE,
} from '@masalim/types';
import { createStorySchema, generatedStorySchema } from './stories';

describe('ageRangeFromAge', () => {
  it.each([
    [0, 'AGE_0_2'],
    [2, 'AGE_0_2'],
    [3, 'AGE_3_5'],
    [5, 'AGE_3_5'],
    [6, 'AGE_6_8'],
    [8, 'AGE_6_8'],
    [9, 'AGE_9_12'],
    [12, 'AGE_9_12'],
    [15, 'AGE_9_12'],
  ])('maps age %i to %s', (age, expected) => {
    expect(ageRangeFromAge(age)).toBe(expected);
  });
});

describe('resolvePageCount', () => {
  it('always stays inside the age band page range', () => {
    for (const ageRange of AGE_RANGES) {
      for (const duration of STORY_DURATIONS) {
        const pages = resolvePageCount(ageRange, duration);
        const band = AGE_BAND_RULES[ageRange];
        expect(pages).toBeGreaterThanOrEqual(band.pages.min);
        expect(pages).toBeLessThanOrEqual(band.pages.max);
      }
    }
  });

  it('never gives a longer story fewer pages than a shorter one', () => {
    for (const ageRange of AGE_RANGES) {
      const short = resolvePageCount(ageRange, 'SHORT');
      const medium = resolvePageCount(ageRange, 'MEDIUM');
      const long = resolvePageCount(ageRange, 'LONG');
      expect(medium).toBeGreaterThanOrEqual(short);
      expect(long).toBeGreaterThanOrEqual(medium);
    }
  });

  it('keeps the youngest band at very few pages even for a long story', () => {
    expect(resolvePageCount('AGE_0_2', 'LONG')).toBeLessThanOrEqual(6);
  });
});

describe('duration rules', () => {
  it('word targets match the advertised minute labels at Turkish narration pace', () => {
    for (const duration of STORY_DURATIONS) {
      const rule = DURATION_RULES[duration];
      const impliedMinutes = rule.targetWords / TURKISH_NARRATION_WORDS_PER_MINUTE;
      expect(Math.abs(impliedMinutes - rule.approxMinutes)).toBeLessThan(0.5);
    }
  });
});

describe('age band rules', () => {
  it('tension and density both rise monotonically with age', () => {
    const ordered = AGE_RANGES.map((range) => AGE_BAND_RULES[range]);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      expect(current.maxTensionLevel).toBeGreaterThanOrEqual(previous.maxTensionLevel);
      expect(current.maxSentenceWords).toBeGreaterThan(previous.maxSentenceWords);
      expect(current.wordsPerPage.min).toBeGreaterThan(previous.wordsPerPage.min);
    }
  });

  it('gives the 0–2 band no peril at all', () => {
    expect(AGE_BAND_RULES.AGE_0_2.maxTensionLevel).toBe(0);
  });
});

describe('createStorySchema', () => {
  const base = {
    heroName: 'Ege',
    heroType: 'CHILD' as const,
    themes: ['space' as const, 'adventure' as const],
    ageRange: 'AGE_6_8' as const,
    durationTarget: 'MEDIUM' as const,
    idempotencyKey: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  };

  it('accepts a minimal wizard submission with no child and no narrator', () => {
    expect(createStorySchema.safeParse(base).success).toBe(true);
  });

  it('rejects a submission with no theme', () => {
    expect(createStorySchema.safeParse({ ...base, themes: [] }).success).toBe(false);
  });

  it('rejects a submission naming both a parent voice and a system voice', () => {
    const result = createStorySchema.safeParse({
      ...base,
      voiceProfileId: 'clx1234567890abcdefgh',
      systemVoiceId: 'clx0987654321hgfedcba',
    });
    expect(result.success).toBe(false);
  });

  it('requires an idempotency key so a retried submit cannot duplicate a story', () => {
    const { idempotencyKey: _omitted, ...withoutKey } = base;
    expect(createStorySchema.safeParse(withoutKey).success).toBe(false);
  });
});

describe('generatedStorySchema', () => {
  const page = (pageNumber: number) => ({
    pageNumber,
    text: 'Ege küçük roketine bindi ve yıldızlara doğru yola çıktı.',
    illustrationPrompt: 'A small child in a red rocket flying past soft watercolour stars.',
  });

  it('accepts a well-formed model response', () => {
    const result = generatedStorySchema.safeParse({
      title: 'Ege ve Kayıp Yıldız',
      summary: 'Ege kaybolan küçük bir yıldızı evine döndürür.',
      pages: [page(1), page(2), page(3), page(4)],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a response with too few pages so the repair retry can fire', () => {
    const result = generatedStorySchema.safeParse({
      title: 'Ege ve Kayıp Yıldız',
      summary: 'Ege kaybolan küçük bir yıldızı evine döndürür.',
      pages: [page(1)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a page missing its illustration prompt', () => {
    const result = generatedStorySchema.safeParse({
      title: 'Ege ve Kayıp Yıldız',
      summary: 'Ege kaybolan küçük bir yıldızı evine döndürür.',
      pages: [page(1), page(2), page(3), { pageNumber: 4, text: 'Son.' }],
    });
    expect(result.success).toBe(false);
  });
});
