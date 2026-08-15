/**
 * The shape the flag form and its Server Action pass back and forth.
 *
 * It lives apart from `actions.ts` because a `'use server'` module may only
 * export async functions, and both sides need the idle constant.
 *
 * `serverMessage` stays separate from `message`: the first is the API's own
 * sentence kept word for word, the second is what the console can say about it
 * in Turkish. A refused rollout is only diagnosable if the original words
 * survive the trip.
 */
export interface FlagActionState {
  outcome: 'idle' | 'success' | 'error';
  message: string | null;
  serverMessage: string | null;
  /** Keyed by form field name. */
  fieldErrors: Record<string, string>;
}

export const EMPTY_FLAG_ACTION_STATE: FlagActionState = {
  outcome: 'idle',
  message: null,
  serverMessage: null,
  fieldErrors: {},
};

/** The longest reason the API's audit note accepts. */
export const FLAG_REASON_MAX_LENGTH = 200;
