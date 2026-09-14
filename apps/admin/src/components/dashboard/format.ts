/**
 * Formatting for the numbers on the shift-opening panel.
 *
 * The judgement here is that a dashboard may round for readability but must
 * never round by accident. AI spend arrives as a BigInt string in millionths of
 * a currency unit; putting it through `Number` would silently lose precision
 * once the day's spend passes a few billion micros, so it is divided as a
 * BigInt and reassembled as text. Separators come from the locale rather than
 * from literals, so the panel keeps reading as Turkish if it is ever formatted
 * elsewhere.
 */

const INTEGER_FORMAT = new Intl.NumberFormat('tr-TR');

const DECIMAL_SEPARATOR =
  INTEGER_FORMAT.formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? ',';

/** Micros are millionths, so the fraction is always six digits wide. */
const MICRO_DIGITS = 6;

/** Below this many digits the amount reads as a truncation rather than a price. */
const MIN_FRACTION_DIGITS = 2;

/** A plain count, grouped for scanning. */
export function formatCount(value: number): string {
  return INTEGER_FORMAT.format(value);
}

/**
 * A BigInt micro amount as a decimal string.
 *
 * Returns the server's own string untouched if it is not an integer: showing
 * what the API sent is more useful to whoever has to debug it than showing a
 * confident `0` that was never true.
 */
export function formatMicros(value: string): string {
  const match = /^\s*(-?)(\d+)\s*$/.exec(value);
  if (!match) return value.trim();

  const sign = match[1] ?? '';
  const micros = BigInt(match[2] ?? '0');

  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(MICRO_DIGITS, '0');
  const trimmed = fraction.replace(/0+$/, '');
  const shown =
    trimmed.length < MIN_FRACTION_DIGITS ? fraction.slice(0, MIN_FRACTION_DIGITS) : trimmed;

  return `${sign}${INTEGER_FORMAT.format(whole)}${DECIMAL_SEPARATOR}${shown}`;
}

/**
 * A calendar day the API already resolved in the operating timezone.
 *
 * Formatted from its parts in UTC rather than parsed as an instant, because
 * `new Date('2026-08-15')` would be midnight UTC and would render as the day
 * before for any reader west of Greenwich — the exact confusion this page is
 * trying to prevent.
 */
export function formatOperatingDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/**
 * An instant, shown in the operating timezone.
 *
 * The timezone comes from the API, so an unknown zone identifier would throw
 * inside `Intl` and take the whole panel down with it. The fallback formats in
 * UTC and says so in the returned string: the caller prints the zone the server
 * sent, which in exactly this case is the one that did not work, and a time
 * shown under a label it was not computed in is worse than an ugly one.
 */
export function formatInstantInZone(instant: string, timeZone: string): string {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return instant;

  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    const utc = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
    return `${utc} (UTC)`;
  }
}
