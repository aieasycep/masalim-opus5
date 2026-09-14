import { describe, expect, it } from 'vitest';
import { ERROR_CODES, NETWORK_ERROR_CODE, type ClientErrorCode } from '@masalim/types';
import { createTranslator, interpolate, resolveLocale } from './translator';
import { tr } from './messages/tr';
import { en } from './messages/en';
import { TR_ERRORS } from './messages/tr-errors';
import { EN_ERRORS } from './messages/en-errors';

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('Merhaba {{name}}', { name: 'Ege' })).toBe('Merhaba Ege');
  });

  it('replaces the same placeholder more than once', () => {
    expect(interpolate('{{n}} ve {{n}}', { n: 'Ada' })).toBe('Ada ve Ada');
  });

  it('leaves unknown placeholders visible rather than printing undefined', () => {
    expect(interpolate('Merhaba {{name}}', { other: 'x' })).toBe('Merhaba {{name}}');
  });

  it('accepts numbers', () => {
    expect(interpolate('{{count}} hikâye', { count: 3 })).toBe('3 hikâye');
  });
});

describe('createTranslator', () => {
  it('resolves nested Turkish keys', () => {
    const t = createTranslator('tr');
    expect(t.t('storyCreate.step1Title')).toBe('Bu hikâye kimin için?');
  });

  it('interpolates the child name into the hero card', () => {
    const t = createTranslator('tr');
    expect(t.t('home.heroTitle', { name: 'Ege' })).toBe('Ege için bir hikâye oluştur');
  });

  it('resolves English', () => {
    const t = createTranslator('en');
    expect(t.t('storyCreate.step1Title')).toBe('Who is this story for?');
  });

  it('returns the key when a message is missing, so gaps are visible', () => {
    const t = createTranslator('tr');
    expect(t.t('does.not.exist')).toBe('does.not.exist');
  });

  it('reads list messages such as the generating screen rotation', () => {
    const t = createTranslator('tr');
    const messages = t.tList('storyGenerating.messages');
    expect(messages.length).toBeGreaterThan(3);
    expect(messages[0]).toContain('kahraman');
  });
});

describe('error catalogue', () => {
  const allCodes: ClientErrorCode[] = [
    ...(Object.values(ERROR_CODES) as ClientErrorCode[]),
    NETWORK_ERROR_CODE,
  ];

  it('covers every error code in Turkish', () => {
    const missing = allCodes.filter((code) => !TR_ERRORS[code]);
    expect(missing).toEqual([]);
  });

  it('covers every error code in English', () => {
    const missing = allCodes.filter((code) => !EN_ERRORS[code]);
    expect(missing).toEqual([]);
  });

  it('never leaks a raw error code into the message shown to a parent', () => {
    for (const code of allCodes) {
      const message = TR_ERRORS[code];
      expect(message.title).not.toContain(code);
      expect(message.message).not.toContain(code);
      expect(message.title).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
      expect(message.message).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    }
  });

  it('uses the brief’s exact wording for a rejected story idea', () => {
    const t = createTranslator('tr');
    expect(t.error('STORY_CONTENT_NOT_SUITABLE').message).toBe(
      'Bu konuyla çocuklara uygun bir hikâye oluşturamıyoruz. İstersen fikri birlikte değiştirebiliriz.',
    );
  });

  it('reassures the parent that a failed voice clone kept their recording', () => {
    const t = createTranslator('tr');
    expect(t.error('VOICE_PROCESSING_FAILED').message).toContain('Kaydın güvende');
  });

  it('falls back to a generic message for an unknown code', () => {
    const t = createTranslator('tr');
    const unknown = 'NOT_A_REAL_CODE' as ClientErrorCode;
    expect(t.error(unknown)).toEqual(TR_ERRORS.INTERNAL_ERROR);
  });
});

describe('catalogue parity', () => {
  function collectKeys(node: unknown, prefix = ''): string[] {
    if (typeof node === 'string') return [prefix];
    if (Array.isArray(node)) return [prefix];
    if (typeof node !== 'object' || node === null) return [];
    return Object.entries(node).flatMap(([key, value]) =>
      collectKeys(value, prefix ? `${prefix}.${key}` : key),
    );
  }

  it('English has exactly the same keys as Turkish', () => {
    const trKeys = collectKeys(tr).sort();
    const enKeys = collectKeys(en).sort();
    expect(enKeys).toEqual(trKeys);
  });

  it('has no empty strings in either catalogue', () => {
    for (const [name, catalogue] of [
      ['tr', tr],
      ['en', en],
    ] as const) {
      const empties = collectKeys(catalogue).filter((key) => {
        const value = key
          .split('.')
          .reduce<unknown>(
            (node, segment) => (node as Record<string, unknown>)?.[segment],
            catalogue,
          );
        return typeof value === 'string' && value.trim().length === 0;
      });
      expect(`${name}: ${empties.join(', ')}`).toBe(`${name}: `);
    }
  });
});

describe('resolveLocale', () => {
  it.each([
    ['tr', 'tr'],
    ['tr-TR', 'tr'],
    ['en', 'en'],
    ['en-GB', 'en'],
    ['EN_US', 'en'],
    ['de', 'tr'],
    ['', 'tr'],
    [null, 'tr'],
    [undefined, 'tr'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});
