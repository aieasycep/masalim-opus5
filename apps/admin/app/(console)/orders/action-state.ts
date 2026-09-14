/**
 * The shape the fulfilment forms and their Server Actions pass back and forth.
 *
 * It lives apart from `actions.ts` because a `'use server'` module may only
 * export async functions, and both sides need these constants.
 *
 * `serverMessage` is deliberately separate from `message`: the first is the
 * API's own sentence, kept verbatim, and the second is what the console can say
 * about it in Turkish. A refusal from the printer or a race with another
 * operator is only diagnosable if the original words survive.
 */
export interface OrderActionState {
  outcome: 'idle' | 'success' | 'error';
  message: string | null;
  serverMessage: string | null;
  /** Keyed by form field name. */
  fieldErrors: Record<string, string>;
}

export const EMPTY_ORDER_ACTION_STATE: OrderActionState = {
  outcome: 'idle',
  message: null,
  serverMessage: null,
  fieldErrors: {},
};
