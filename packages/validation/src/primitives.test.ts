import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  freeTextSchema,
  moneyAmountSchema,
  passwordSchema,
  personNameSchema,
  turkishPhoneSchema,
  turkishPostalCodeSchema,
} from './primitives';

describe('turkishPhoneSchema', () => {
  it.each([
    ['+905321234567', '+905321234567'],
    ['05321234567', '+905321234567'],
    ['5321234567', '+905321234567'],
    ['0532 123 45 67', '+905321234567'],
    ['(0532) 123-4567', '+905321234567'],
  ])('normalises %s to E.164', (input, expected) => {
    expect(turkishPhoneSchema.parse(input)).toBe(expected);
  });

  it.each(['1234567890', '+15551234567', '053212345', '0532123456789', 'abcdefghijk'])(
    'rejects %s',
    (input) => {
      expect(turkishPhoneSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('personNameSchema', () => {
  it.each(['Ege', 'Ada', 'Ayşe Yılmaz', 'Işıl', 'Gökçe', 'Ömer Faruk', "Zeynep'nin"])(
    'accepts Turkish name %s',
    (name) => {
      expect(personNameSchema.safeParse(name).success).toBe(true);
    },
  );

  it('rejects names that start with punctuation or contain digits', () => {
    expect(personNameSchema.safeParse('-Ege').success).toBe(false);
    expect(personNameSchema.safeParse('Ege1').success).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    expect(personNameSchema.parse('  Ege  ')).toBe('Ege');
  });
});

describe('passwordSchema', () => {
  it('accepts a long passphrase with a digit', () => {
    expect(passwordSchema.safeParse('masalgecesi7').success).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(passwordSchema.safeParse('kisa1').success).toBe(false);
  });

  it('rejects passwords with no digit', () => {
    expect(passwordSchema.safeParse('masalgecesidir').success).toBe(false);
  });

  it('rejects passwords with no letter', () => {
    expect(passwordSchema.safeParse('1234567890').success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('lowercases and trims', () => {
    expect(emailSchema.parse('  Ayse@Email.COM ')).toBe('ayse@email.com');
  });

  it('rejects malformed addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('freeTextSchema', () => {
  const schema = freeTextSchema(100);

  it('strips control characters so prompt framing cannot be smuggled in', () => {
    expect(schema.parse('Ege\x00\x07\x1f uzaya gitsin')).toBe('Ege uzaya gitsin');
  });

  it('preserves Turkish characters and normal punctuation', () => {
    const text = 'Ege uzayda kaybolan küçük bir yıldızı evine döndürsün.';
    expect(schema.parse(text)).toBe(text);
  });

  it('collapses runaway blank lines', () => {
    expect(schema.parse('bir\n\n\n\n\niki')).toBe('bir\n\niki');
  });

  it('rejects text past the limit', () => {
    expect(schema.safeParse('x'.repeat(101)).success).toBe(false);
  });
});

describe('moneyAmountSchema', () => {
  it.each(['0', '10', '349.90', '1234567890.99'])('accepts %s', (value) => {
    expect(moneyAmountSchema.safeParse(value).success).toBe(true);
  });

  it.each(['-1', '10.999', '1e5', 'abc', ''])('rejects %s', (value) => {
    expect(moneyAmountSchema.safeParse(value).success).toBe(false);
  });
});

describe('turkishPostalCodeSchema', () => {
  it('accepts a five-digit code', () => {
    expect(turkishPostalCodeSchema.parse('34710')).toBe('34710');
  });

  it('rejects anything else', () => {
    expect(turkishPostalCodeSchema.safeParse('3471').success).toBe(false);
    expect(turkishPostalCodeSchema.safeParse('SW1A1AA').success).toBe(false);
  });
});
