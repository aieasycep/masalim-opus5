import { Prisma } from '@prisma/client';

/**
 * Money helpers.
 *
 * Prices are Decimal in the database and decimal strings on the wire. Nothing
 * in between is ever allowed to become a JavaScript float.
 */
export function toDecimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function decimalToString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** Prisma error codes we translate into domain errors rather than 500s. */
export const PRISMA_ERROR_CODES = {
  UNIQUE_CONSTRAINT: 'P2002',
  FOREIGN_KEY_CONSTRAINT: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
} as const;

export function isPrismaError(
  error: unknown,
  code: (typeof PRISMA_ERROR_CODES)[keyof typeof PRISMA_ERROR_CODES],
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Human-facing order numbers.
 *
 * Sequential ids would leak how many orders the business has taken, so the
 * number is a date prefix plus random characters from an alphabet with no
 * look-alike glyphs (no O/0, I/1) — a customer has to read these aloud.
 */
const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(now: Date, random: () => number = Math.random): string {
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ORDER_NUMBER_ALPHABET.charAt(Math.floor(random() * ORDER_NUMBER_ALPHABET.length));
  }
  return `MS${year}${month}-${suffix}`;
}

/** First and last day of the calendar month a quota period covers, in UTC. */
export function monthlyPeriod(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}
