import { randomBytes } from 'node:crypto';
import { isUniqueViolationOn } from '@masalim/database';

/**
 * Crockford base32 — the confusable letters (I, L, O, U) are absent by design, so
 * a parent reading an order number down the phone to support cannot turn a zero
 * into an O.
 */
export const ORDER_NUMBER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Symbols after the year. 32⁶ ≈ 1.07 billion. */
export const ORDER_NUMBER_LENGTH = 6;

/**
 * How many times a collision is redrawn before giving up.
 *
 * Even with the table a third full, five independent draws all colliding has a
 * probability far below the odds of the database being unreachable, so exceeding
 * this means something other than chance is wrong and the error should surface.
 */
export const ORDER_NUMBER_ATTEMPTS = 5;

/** Matches exactly what {@link orderNumber} produces. */
export const ORDER_NUMBER_PATTERN = new RegExp(
  `^MSL-\\d{4}-[${ORDER_NUMBER_ALPHABET}]{${String(ORDER_NUMBER_LENGTH)}}$`,
);

/**
 * A human-facing order number: `MSL-2026-4KQ7ZP`.
 *
 * Random rather than sequential — a sequential number tells any customer how many
 * books the business has sold, and lets them guess their neighbour's.
 *
 * The suffix is drawn symbol by symbol rather than by base-converting one random
 * integer. That is what makes the width exactly six: `toString(36)` of a uint32
 * runs to seven characters for everything above 36⁶, which is roughly half the
 * range, and padding can lengthen a short value but never shorten a long one.
 *
 * The alphabet has 32 symbols and 32 divides 256, so reducing a random byte is
 * uniform — no modulo bias towards the front of the alphabet.
 */
export function orderNumber(year: number): string {
  const bytes = randomBytes(ORDER_NUMBER_LENGTH);
  let suffix = '';
  for (const byte of bytes) {
    suffix += ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length];
  }
  return `MSL-${String(year)}-${suffix}`;
}

/**
 * Runs an insert with a fresh order number, redrawing if that number was taken.
 *
 * Six random symbols is about a billion combinations, which sounds like plenty
 * and is not: by the birthday bound a collision becomes likely around thirty
 * thousand orders and near-certain by a hundred thousand. Widening the number
 * only moves that wall — `orderNumber` is a unique column, so the correct answer
 * is to draw again. Without this, one parent's checkout eventually fails on a
 * constraint violation they could never act on.
 *
 * Only a clash on `orderNumber` is retried. A clash on `idempotencyKey` means two
 * submits of the *same* order raced, and the caller wants the row that already
 * exists rather than a second one — so that error is rethrown untouched.
 */
export async function withUniqueOrderNumber<T>(
  year: number,
  insert: (orderNumber: string) => Promise<T>,
  onCollision: (attempt: number) => void = () => undefined,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await insert(orderNumber(year));
    } catch (error) {
      if (!isUniqueViolationOn(error, 'orderNumber')) throw error;
      lastError = error;
      onCollision(attempt);
    }
  }

  // Five independent collisions is not chance; let the real error surface.
  throw lastError;
}
