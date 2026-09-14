import { z } from 'zod';
import { CURRENCIES, LOCALES } from '@masalim/types';

/** CUIDv2 is what Prisma generates for every primary key. */
export const idSchema = z.string().min(20).max(40).regex(/^[a-z0-9]+$/, 'INVALID_ID');

export const localeSchema = z.enum(LOCALES);
export const currencySchema = z.enum(CURRENCIES);

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

export const emailSchema = z.string().trim().toLowerCase().email('INVALID_EMAIL').max(254);

/**
 * Password policy. Deliberately length-first rather than a symbol-soup rule:
 * long passphrases are both safer and easier for a tired parent at bedtime.
 */
export const passwordSchema = z
  .string()
  .min(10, 'PASSWORD_TOO_SHORT')
  .max(128, 'PASSWORD_TOO_LONG')
  .refine((value) => /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(value), 'PASSWORD_NEEDS_LETTER')
  .refine((value) => /\d/.test(value), 'PASSWORD_NEEDS_DIGIT');

/** Turkish given names include ç ğ ı İ ö ş ü and apostrophes; keep those, drop control chars. */
export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'NAME_REQUIRED')
  .max(60, 'NAME_TOO_LONG')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u, 'NAME_INVALID_CHARACTERS');

/** Turkish mobile numbers, accepted as +905XXXXXXXXX, 05XXXXXXXXX or 5XXXXXXXXX. */
export const turkishPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(\+90|0)?5\d{9}$/, 'PHONE_INVALID'))
  .transform((value) => {
    const digits = value.replace(/^\+90/, '').replace(/^0/, '');
    return `+90${digits}`;
  });

export const turkishPostalCodeSchema = z.string().trim().regex(/^\d{5}$/, 'POSTAL_CODE_INVALID');

/** Monetary values cross the wire as decimal strings to preserve precision. */
export const moneyAmountSchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'INVALID_AMOUNT');

export const moneySchema = z.object({
  amount: moneyAmountSchema,
  currency: currencySchema,
});

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// Control characters are stripped before free text reaches a model prompt, so a
// parent's story idea cannot smuggle in framing that alters the instructions.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Free text the parent types which eventually reaches a model prompt.
 * Caps length so a prompt cannot be inflated, and collapses runaway whitespace.
 */
export function freeTextSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, 'TEXT_TOO_LONG')
    .transform((value) => value.replace(CONTROL_CHARACTERS, '').replace(/\n{3,}/g, '\n\n'));
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z]+\/[A-Za-z_\-+0-9/]+$|^UTC$/, 'TIMEZONE_INVALID');
