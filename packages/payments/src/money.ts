/**
 * Money as integer minor units.
 *
 * Every amount that crosses a boundary — the database, the API, a provider —
 * travels as a decimal string, and every amount that is *computed* is an integer
 * count of kuruş. Floating point has no business anywhere near a price: 0.1+0.2
 * is the reason a customer is charged 39.99999999 lira.
 */
export type Minor = number;

const MINOR_UNITS_PER_MAJOR = 100;

export function fromDecimalString(value: string): Minor {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Not a money amount: ${value}`);
  }
  const negative = trimmed.startsWith('-');
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.');
  const minor =
    Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -minor : minor;
}

export function toDecimalString(value: Minor): string {
  const negative = value < 0;
  const absolute = Math.abs(Math.round(value));
  const whole = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Normalises an amount to exactly two decimal places.
 *
 * Postgres numerics arrive as `"708"` where the quote that produced them said
 * `"708.00"`. Same money, two spellings — enough for a client comparing the two
 * to think the price changed between the quote and the order, and enough to make
 * a price render inconsistently on two screens. Every amount leaving the API goes
 * through here.
 */
export function normaliseAmount(value: string): string {
  return toDecimalString(fromDecimalString(value));
}

/**
 * A percentage of an amount, rounded half-up.
 *
 * Rounding is stated explicitly rather than left to the language: a discount
 * that rounds differently from the total is the kind of one-kuruş mismatch that
 * makes a payment provider reject the whole charge.
 */
export function percentOf(value: Minor, percent: number): Minor {
  return Math.round((value * percent) / 100);
}
