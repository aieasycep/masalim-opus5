/**
 * The shape the decision form and its Server Action pass back and forth.
 *
 * It lives apart from `actions.ts` because a `'use server'` module may only
 * export async functions, and both sides need this constant.
 */
export interface DecisionState {
  /** What went wrong, said in Turkish. */
  error: string | null;
  /** The API's own words, kept verbatim so a failure is never reduced to a shrug. */
  serverMessage: string | null;
  /** Keyed by form field name. */
  fieldErrors: Record<string, string>;
}

export const EMPTY_DECISION_STATE: DecisionState = {
  error: null,
  serverMessage: null,
  fieldErrors: {},
};
