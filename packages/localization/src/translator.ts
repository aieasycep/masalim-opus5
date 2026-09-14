import { DEFAULT_LOCALE, type ClientErrorCode, type Locale } from '@masalim/types';
import { tr } from './messages/tr';
import { en } from './messages/en';
import { TR_ERRORS } from './messages/tr-errors';
import { EN_ERRORS } from './messages/en-errors';
import type { InterpolationValues, MessageCatalogue } from './types';

const CATALOGUES: Record<Locale, MessageCatalogue> = {
  tr: tr as unknown as MessageCatalogue,
  en,
};

const ERROR_CATALOGUES: Record<
  Locale,
  Record<ClientErrorCode, { title: string; message: string }>
> = {
  tr: TR_ERRORS,
  en: EN_ERRORS,
};

const INTERPOLATION_PATTERN = /\{\{(\w+)\}\}/g;

export function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(INTERPOLATION_PATTERN, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function lookup(catalogue: MessageCatalogue, key: string): unknown {
  let node: unknown = catalogue;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

export interface Translator {
  readonly locale: Locale;
  /** Resolve a dot-separated key, interpolating `{{placeholders}}`. */
  t(key: string, values?: InterpolationValues): string;
  /** Resolve a key that holds an array of strings, e.g. loading messages. */
  tList(key: string, values?: InterpolationValues): string[];
  /** Turn an error code into the parent-facing title and message. */
  error(code: ClientErrorCode): { title: string; message: string };
}

export function resolveLocale(candidate: string | null | undefined): Locale {
  if (!candidate) return DEFAULT_LOCALE;
  const normalised = candidate.toLowerCase().split(/[-_]/)[0];
  return normalised === 'en' ? 'en' : normalised === 'tr' ? 'tr' : DEFAULT_LOCALE;
}

export function createTranslator(locale: Locale = DEFAULT_LOCALE): Translator {
  const catalogue = CATALOGUES[locale];
  const fallback = CATALOGUES[DEFAULT_LOCALE];

  return {
    locale,

    t(key, values) {
      const value = lookup(catalogue, key) ?? lookup(fallback, key);
      if (typeof value !== 'string') {
        // Returning the key keeps the UI legible and makes the gap obvious in
        // screenshots, rather than rendering an empty label.
        return key;
      }
      return interpolate(value, values);
    },

    tList(key, values) {
      const value = lookup(catalogue, key) ?? lookup(fallback, key);
      if (!Array.isArray(value)) return [];
      return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => interpolate(entry, values));
    },

    error(code) {
      const catalogueForLocale = ERROR_CATALOGUES[locale];
      return catalogueForLocale[code] ?? ERROR_CATALOGUES[DEFAULT_LOCALE].INTERNAL_ERROR;
    },
  };
}
