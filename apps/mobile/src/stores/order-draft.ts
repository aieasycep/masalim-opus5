import { create } from 'zustand';
import type { BookSize, CoverType } from '@masalim/types';

export interface OrderDraft {
  bookId: string | null;
  bookSize: BookSize;
  coverType: CoverType;
  quantity: number;
  addressId: string | null;
  /**
   * Held for the life of one checkout.
   *
   * Generated when the parent reaches the review screen and reused for every
   * retry, so a submit that times out on a bad connection and is tapped again
   * returns the same order instead of printing a second book.
   */
  idempotencyKey: string | null;
  /** Set once the order exists, so the payment screen survives a back-and-forth. */
  orderId: string | null;
}

const EMPTY: OrderDraft = {
  bookId: null,
  bookSize: 'SQUARE',
  coverType: 'HARDCOVER',
  quantity: 1,
  addressId: null,
  idempotencyKey: null,
  orderId: null,
};

interface OrderDraftState {
  draft: OrderDraft;
  update: (patch: Partial<OrderDraft>) => void;
  reset: () => void;
}

/**
 * The checkout, held across its four screens.
 *
 * In memory rather than persisted, like the voice enrolment and unlike the story
 * wizard. A restored checkout is a trap: prices move, a book can be edited or
 * deleted between sessions, and an address can be removed — resuming from a
 * three-day-old draft would show a parent a total the server no longer agrees
 * with. Configuration is cheap to redo; a wrong price is not.
 *
 * Nothing here is ever sent as money. The draft carries configuration only, and
 * every figure on screen comes from the server's quote (§82).
 */
export const useOrderDraft = create<OrderDraftState>((set) => ({
  draft: EMPTY,
  update: (patch) => {
    set((state) => ({ draft: { ...state.draft, ...patch } }));
  },
  reset: () => {
    set({ draft: EMPTY });
  },
}));
