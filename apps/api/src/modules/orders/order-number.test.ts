import { describe, expect, it } from 'vitest';
import { Prisma } from '@masalim/database';
import {
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_ATTEMPTS,
  ORDER_NUMBER_LENGTH,
  ORDER_NUMBER_PATTERN,
  orderNumber,
  withUniqueOrderNumber,
} from './order-number';

const DRAWS = 20_000;

function draw(count: number): string[] {
  return Array.from({ length: count }, () => orderNumber(2026));
}

describe('order number', () => {
  /**
   * The regression this file exists for.
   *
   * The first implementation base-converted a random uint32 with `toString(36)`
   * and padded the result to six. Everything from 36⁶ up converts to *seven*
   * characters and padding leaves it there — so roughly half of all order numbers
   * came out the wrong width, and which half was pure luck. One draw per test run
   * hid it; twenty thousand cannot.
   */
  it('is always exactly the same width', () => {
    const widths = new Set(draw(DRAWS).map((value) => value.length));
    expect([...widths]).toEqual([`MSL-2026-`.length + ORDER_NUMBER_LENGTH]);
  });

  it('always matches the published pattern', () => {
    const bad = draw(DRAWS).filter((value) => !ORDER_NUMBER_PATTERN.test(value));
    expect(bad).toEqual([]);
  });

  it('carries the year it was placed in', () => {
    expect(orderNumber(2027).startsWith('MSL-2027-')).toBe(true);
  });

  it('never uses a symbol a parent could misread', () => {
    const suffixes = draw(2_000).map((value) => value.slice('MSL-2026-'.length));
    const used = new Set(suffixes.join(''));
    for (const symbol of used) {
      expect(ORDER_NUMBER_ALPHABET).toContain(symbol);
    }
    // The whole point of Crockford's alphabet.
    for (const confusable of ['I', 'L', 'O', 'U']) {
      expect(used.has(confusable)).toBe(false);
    }
  });

  /**
   * 32 divides 256, so a byte reduced into the alphabet is uniform. If someone
   * later widens the alphabet to a size that does not divide 256, the low symbols
   * start appearing more often and collisions concentrate — this is the guard.
   */
  it('draws each symbol about equally often', () => {
    expect(256 % ORDER_NUMBER_ALPHABET.length).toBe(0);

    const counts = new Map<string, number>();
    for (const value of draw(DRAWS)) {
      for (const symbol of value.slice('MSL-2026-'.length)) {
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      }
    }

    expect(counts.size).toBe(ORDER_NUMBER_ALPHABET.length);
    const expected = (DRAWS * ORDER_NUMBER_LENGTH) / ORDER_NUMBER_ALPHABET.length;
    for (const [symbol, count] of counts) {
      expect(Math.abs(count - expected) / expected, `${symbol} is skewed`).toBeLessThan(0.2);
    }
  });

  /**
   * Deliberately *not* asserting that draws never repeat.
   *
   * Six symbols is about a billion combinations, so the birthday bound puts a
   * first collision somewhere around thirty thousand orders — an assertion of
   * uniqueness here would be a test that fails a fifth of the time and teaches
   * whoever inherits it to re-run CI until it passes. Uniqueness is the database's
   * job (`orderNumber` is a unique column) and recovering from a clash is
   * `withUniqueOrderNumber`'s. What belongs here is the rate.
   */
  it('collides rarely enough that a bounded retry always wins', () => {
    const values = draw(DRAWS);
    const duplicates = values.length - new Set(values).size;
    expect(duplicates / values.length).toBeLessThan(0.001);
  });
});

describe('collision recovery', () => {
  function uniqueViolation(field: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [field] },
    });
  }

  it('draws again when the number was already taken', async () => {
    const taken = new Set<string>();
    let calls = 0;

    const result = await withUniqueOrderNumber(2026, async (candidate) => {
      calls += 1;
      // The first two draws land on numbers the table already holds.
      if (calls <= 2) {
        taken.add(candidate);
        throw uniqueViolation('orderNumber');
      }
      return candidate;
    });

    expect(calls).toBe(3);
    expect(taken.has(result)).toBe(false);
    expect(result).toMatch(ORDER_NUMBER_PATTERN);
  });

  /**
   * The distinction that makes the retry safe.
   *
   * Two submits of the same order racing past the idempotency lookup must not be
   * retried into two orders — the caller has to see the conflict and return the
   * order that already exists. Reacting to a bare P2002 would print the book twice.
   */
  it('does not retry a clash on the idempotency key', async () => {
    let calls = 0;

    await expect(
      withUniqueOrderNumber(2026, async () => {
        calls += 1;
        throw uniqueViolation('idempotencyKey');
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    expect(calls).toBe(1);
  });

  it('passes any other failure straight through', async () => {
    let calls = 0;

    await expect(
      withUniqueOrderNumber(2026, async () => {
        calls += 1;
        throw new Error('connection lost');
      }),
    ).rejects.toThrow('connection lost');

    expect(calls).toBe(1);
  });

  it('gives up rather than spinning when every draw collides', async () => {
    let calls = 0;

    await expect(
      withUniqueOrderNumber(2026, async () => {
        calls += 1;
        throw uniqueViolation('orderNumber');
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    expect(calls).toBe(ORDER_NUMBER_ATTEMPTS);
  });

  it('reports each collision so a shrinking number space is visible in the logs', async () => {
    const seen: number[] = [];
    let calls = 0;

    await withUniqueOrderNumber(
      2026,
      async (candidate) => {
        calls += 1;
        if (calls === 1) throw uniqueViolation('orderNumber');
        return candidate;
      },
      (attempt) => seen.push(attempt),
    );

    expect(seen).toEqual([1]);
  });
});
