import type { OrderStatus } from '@masalim/types';

/**
 * How an order's state is named and coloured.
 *
 * One table rather than a `switch` in each of the three screens that show a
 * status, because the list, the detail and the confirmation must never disagree
 * about what "Kargoda" looks like.
 */
export const ORDER_STATUS_KEYS: Readonly<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'order.statusPendingPayment',
  PAID: 'order.statusPaid',
  IN_PRODUCTION: 'order.statusInProduction',
  SHIPPED: 'order.statusShipped',
  DELIVERED: 'order.statusDelivered',
  CANCELLED: 'order.statusCancelled',
  REFUNDED: 'order.statusRefunded',
};

export type OrderTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

export const ORDER_STATUS_TONES: Readonly<Record<OrderStatus, OrderTone>> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'primary',
  IN_PRODUCTION: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

/**
 * The states a parent can still cancel from.
 *
 * Mirrors the server's rule exactly. Past PAID the book is on a press and the
 * paper is already cut, so offering a cancel button that the API would refuse
 * would be worse than not offering one.
 */
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['PENDING_PAYMENT', 'PAID']);

export function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE.has(status);
}

/** Order of the timeline on the detail screen; terminal states are not steps. */
export const ORDER_TIMELINE: readonly OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
];
