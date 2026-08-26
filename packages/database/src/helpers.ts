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
 * True when a unique constraint failed *on a particular field*.
 *
 * A table usually has more than one unique column, and the right reaction differs
 * per column — a clashing random order number should be redrawn, while a clashing
 * idempotency key means the caller wants the row that already exists. Reacting to
 * the bare `P2002` cannot tell them apart.
 *
 * Prisma reports the columns in `meta.target`, as an array for most databases and
 * a bare string for a few; both shapes are accepted here.
 */
export function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (!isPrismaError(error, PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT)) return false;

  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (typeof target === 'string') return target.includes(field);
  if (Array.isArray(target)) return target.some((column) => String(column).includes(field));
  return false;
}

/** First and last day of the calendar month a quota period covers, in UTC. */
export function monthlyPeriod(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}
