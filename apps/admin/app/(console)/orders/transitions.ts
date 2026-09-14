import type { OrderStatus } from '@masalim/types';
import type { AdminOrderAdvanceStatus } from '@masalim/validation';

/**
 * What the console offers an operator, mirroring what the API will accept.
 *
 * This table is a copy of the one in `admin-orders.service.ts`, kept here so the
 * page can offer three buttons instead of a dropdown of every status that mostly
 * produces refusals. It is a courtesy, never an authority: the server re-checks
 * the transition, and the two rules that cannot be checked from here — a
 * shipment needs a tracking number, and a cancellation needs the printer to
 * agree to recall the job — stay the server's to enforce and the operator's to
 * be told about honestly.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly AdminOrderAdvanceStatus[]>> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function allowedTransitions(status: OrderStatus): readonly AdminOrderAdvanceStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

/** Statuses where attaching or correcting a tracking number still makes sense. */
const TRACKABLE_STATUSES: readonly OrderStatus[] = ['PAID', 'IN_PRODUCTION', 'SHIPPED'];

export function canAttachTracking(status: OrderStatus): boolean {
  return TRACKABLE_STATUSES.includes(status);
}

/**
 * Why an operator would press this, in the operator's own terms.
 *
 * `caution` is set where the move is one the server may still refuse or the
 * customer will immediately hear about, so the form can say so before the click
 * rather than after it.
 */
export interface TransitionCopy {
  /** The verb on the button. */
  action: string;
  /** What actually happens when the server accepts it. */
  effect: string;
  caution?: string;
}

const TRANSITION_COPY: Record<AdminOrderAdvanceStatus, TransitionCopy> = {
  IN_PRODUCTION: {
    action: 'Baskıya al',
    effect: 'Sipariş baskıda olarak işaretlenir. Aileye bildirim gitmez.',
  },
  SHIPPED: {
    action: 'Kargoya verildi',
    effect:
      'Sipariş kargoda olarak işaretlenir ve aileye takip numarasını içeren bildirim gönderilir.',
    caution:
      'Takip numarası olmadan bu adım reddedilir; bildirimde takip edilecek bir numara olmaması, hiç bildirim gitmemesinden kötüdür.',
  },
  DELIVERED: {
    action: 'Teslim edildi',
    effect: 'Sipariş kapanır ve aileye teslimat bildirimi gönderilir.',
  },
  CANCELLED: {
    action: 'Siparişi iptal et',
    effect: 'Sipariş iptal edilir. Para iadesi buradan yapılmaz; ödeme sağlayıcısından yürür.',
    caution:
      'Önce matbaadan baskının geri çekilmesi istenir. Baskı başlamışsa matbaa reddeder ve iptal gerçekleşmez.',
  },
};

export function transitionCopy(status: AdminOrderAdvanceStatus): TransitionCopy {
  return TRANSITION_COPY[status];
}
