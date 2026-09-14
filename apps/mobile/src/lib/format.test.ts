import { describe, expect, it } from 'vitest';
import type { StorySummaryDto } from '@masalim/types';
import { formatDuration, formatMoney, storyMeta } from './format';

const t = (key: string, values?: Record<string, string | number>): string =>
  key === 'common.minutes' ? `${String(values?.count ?? '')} dk` : key;

function story(overrides: Partial<StorySummaryDto> = {}): StorySummaryDto {
  return {
    id: 'story-1',
    title: 'Ege ve Kayıp Yıldız',
    summary: null,
    childId: 'child-1',
    childName: 'Ege',
    themes: ['adventure'],
    ageRange: 'AGE_3_5',
    status: 'READY',
    coverImageUrl: null,
    durationSeconds: 372,
    narratorLabel: 'Anne',
    hasBook: false,
    hasIllustrations: false,
    isFavourite: false,
    createdAt: '2026-08-14T20:00:00.000Z',
    ...overrides,
  };
}

describe('story meta', () => {
  it('joins whatever is actually true', () => {
    expect(storyMeta(story(), t)).toBe('Ege · 6 dk · Anne');
  });

  it('leaves no dangling separators when a story has no narration yet', () => {
    expect(storyMeta(story({ durationSeconds: null, narratorLabel: null }), t)).toBe('Ege');
  });

  it('handles a story with no child at all', () => {
    const meta = storyMeta(story({ childName: null, narratorLabel: null }), t);
    expect(meta).toBe('6 dk');
    expect(meta).not.toContain('·');
  });

  it('never rounds a short story down to zero minutes', () => {
    expect(storyMeta(story({ durationSeconds: 20 }), t)).toContain('1 dk');
  });
});

describe('duration', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [61, '1:01'],
    [372, '6:12'],
    [3600, '60:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('clamps a negative position rather than showing a minus sign', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('money', () => {
  /**
   * The amount arrives as a decimal string and is only ever reformatted. If any
   * of this went through a float, `1234.56` would eventually render as
   * `1234.5600000000001` on somebody's checkout screen.
   */
  it('formats Turkish lira the way a Turkish reader expects', () => {
    expect(formatMoney({ amount: '499.00', currency: 'TRY' })).toBe('₺499,00');
    expect(formatMoney({ amount: '1234.56', currency: 'TRY' })).toBe('₺1.234,56');
    expect(formatMoney({ amount: '1234567.89', currency: 'TRY' })).toBe('₺1.234.567,89');
  });

  it('pads a missing fraction rather than showing a bare integer', () => {
    expect(formatMoney({ amount: '80', currency: 'TRY' })).toBe('₺80,00');
    expect(formatMoney({ amount: '80.5', currency: 'TRY' })).toBe('₺80,50');
  });

  it('falls back to the code for a currency with no symbol', () => {
    expect(formatMoney({ amount: '10.00', currency: 'USD' })).toBe('$10,00');
  });
});
