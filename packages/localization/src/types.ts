import type { tr } from './messages/tr';

/**
 * Same shape as the Turkish catalogue but with plain `string` leaves.
 *
 * Typing `en` as this makes a missing or misnamed translation a compile error,
 * so a screen can never fall back to a blank label at runtime.
 */
export type DeepStringify<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? DeepStringify<U>[]
    : { [K in keyof T]: DeepStringify<T[K]> };

export type MessageCatalogue = DeepStringify<typeof tr>;

/** Dot-separated key path into the catalogue, e.g. `home.heroTitle`. */
export type MessageKey = string;

export type InterpolationValues = Record<string, string | number>;
