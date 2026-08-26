import { ORDER_STATUSES, PAYMENT_STATUSES } from '@masalim/types';
import type {
  BookSize,
  CoverType,
  Money,
  OrderStatus,
  PaymentStatus,
} from '@masalim/types';
import type { BadgeTone } from '../../../src/components/ui';

/**
 * Shared vocabulary for the fulfilment desk.
 *
 * Every label translates a value the server owns and falls back to the raw key,
 * so a status or an event type added upstream tomorrow still appears in the
 * table instead of leaving an empty cell behind.
 *
 * Money is formatted, never recomputed: the amount arrives as a decimal string
 * precisely so nothing is lost to floating point on the way here, and putting
 * it through `Number` to please `Intl` would throw that away for no gain. The
 * digits are grouped as text and dropped into the currency pattern the locale
 * provides.
 */

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Ödeme bekliyor',
  PAID: 'Ödendi',
  IN_PRODUCTION: 'Baskıda',
  SHIPPED: 'Kargoda',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal edildi',
  REFUNDED: 'İade edildi',
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusTone(status: OrderStatus): BadgeTone {
  if (status === 'DELIVERED') return 'success';
  if (status === 'SHIPPED' || status === 'IN_PRODUCTION') return 'primary';
  if (status === 'PAID') return 'warning';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  return 'neutral';
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Beklemede',
  AUTHORIZED: 'Provizyon alındı',
  PAID: 'Ödendi',
  FAILED: 'Başarısız',
  REFUNDED: 'İade edildi',
  PARTIALLY_REFUNDED: 'Kısmen iade edildi',
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  if (status === 'PAID') return 'success';
  if (status === 'AUTHORIZED') return 'primary';
  if (status === 'FAILED') return 'danger';
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'warning';
  return 'neutral';
}

const BOOK_SIZE_LABELS: Record<BookSize, string> = {
  SQUARE: 'Kare',
  STANDARD: 'Standart',
};

const COVER_TYPE_LABELS: Record<CoverType, string> = {
  HARDCOVER: 'Sert kapak',
  SOFTCOVER: 'Yumuşak kapak',
};

export function bookFormatLabel(size: BookSize, cover: CoverType): string {
  return `${BOOK_SIZE_LABELS[size] ?? size} · ${COVER_TYPE_LABELS[cover] ?? cover}`;
}

/**
 * Order events as the API writes them: `ORDER_<status>` from this console and
 * the parent's own app, plus the payment and print milestones.
 */
const EVENT_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Sipariş oluşturuldu',
  PAYMENT_SUCCEEDED: 'Ödeme alındı',
  PAYMENT_FAILED: 'Ödeme başarısız oldu',
  SENT_TO_PRINTER: 'Matbaaya gönderildi',
  TRACKING_ATTACHED: 'Kargo takip numarası eklendi',
  ORDER_PAID: 'Ödendi olarak işaretlendi',
  ORDER_IN_PRODUCTION: 'Baskıya alındı',
  ORDER_SHIPPED: 'Kargoya verildi',
  ORDER_DELIVERED: 'Teslim edildi olarak işaretlendi',
  ORDER_CANCELLED: 'Sipariş iptal edildi',
  ORDER_REFUNDED: 'Sipariş iade edildi',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

const GROUPED_INTEGER = new Intl.NumberFormat('tr-TR');

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return DATE_TIME_FORMAT.format(value);
}

export function formatCount(value: number): string {
  return GROUPED_INTEGER.format(value);
}

interface DecimalParts {
  negative: boolean;
  whole: string;
  fraction: string;
}

function splitDecimal(amount: string): DecimalParts | null {
  const match = /^\s*(-)?(\d+)(?:[.,](\d+))?\s*$/.exec(amount);
  if (!match) return null;
  return {
    negative: match[1] === '-',
    whole: match[2] ?? '0',
    fraction: match[3] ?? '',
  };
}

/**
 * A `Money` value as the operator should read it.
 *
 * Anything the server sends that this cannot parse is shown verbatim next to
 * its currency code: an amount whose shape changed upstream is worth seeing raw,
 * and a confident but wrong total on a fulfilment screen is worse than an ugly
 * one.
 */
export function formatMoney(money: Money): string {
  const parsed = splitDecimal(money.amount);
  if (!parsed) return `${money.amount.trim()} ${money.currency}`;

  let currencyFormat: Intl.NumberFormat;
  try {
    currencyFormat = new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: money.currency,
    });
  } catch {
    return `${money.amount.trim()} ${money.currency}`;
  }

  const minimumDigits = currencyFormat.resolvedOptions().minimumFractionDigits ?? 2;
  const fraction =
    parsed.fraction.length >= minimumDigits
      ? parsed.fraction
      : parsed.fraction.padEnd(minimumDigits, '0');

  const pattern = currencyFormat.formatToParts(0);
  const hasFractionSlot = pattern.some((part) => part.type === 'fraction');
  if (fraction.length > 0 && !hasFractionSlot) {
    return `${parsed.negative ? '-' : ''}${GROUPED_INTEGER.format(BigInt(parsed.whole))},${fraction} ${money.currency}`;
  }

  const rendered = pattern
    .map((part) => {
      if (part.type === 'integer') return GROUPED_INTEGER.format(BigInt(parsed.whole));
      if (part.type === 'group') return '';
      if (part.type === 'fraction') return fraction;
      if (part.type === 'decimal') return fraction.length > 0 ? part.value : '';
      if (part.type === 'minusSign') return '';
      return part.value;
    })
    .join('');

  return parsed.negative ? `-${rendered}` : rendered;
}

/**
 * A filter value from the URL, narrowed against the statuses the server knows.
 *
 * Anything else is dropped rather than passed on: a hand-edited query string
 * should leave the filter unset, not send the API a value it will reject.
 */
export function asOrderStatus(value: string | undefined): OrderStatus | undefined {
  return ORDER_STATUSES.find((status) => status === value);
}

export function asPaymentStatus(value: string | undefined): PaymentStatus | undefined {
  return PAYMENT_STATUSES.find((status) => status === value);
}

/** Reads the first value of a search param that Next may hand over as an array. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
