import React, { createContext, useContext, useMemo, useState } from 'react';
import { createTranslator, type Translator } from '@masalim/localization';
import { isApiError } from '@masalim/api-client';
import type { ClientErrorCode, Locale } from '@masalim/types';
import { deviceLocale } from '../lib/api';

interface I18nValue extends Translator {
  setLocale: (locale: Locale) => void;
  /** Turns any thrown value into copy a parent can read. */
  errorCopy: (error: unknown) => { title: string; message: string };
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Localisation.
 *
 * Every string in the app comes from here. `errorCopy` is the important part:
 * screens never inspect an error themselves, they hand it over and get a title
 * and a sentence back. That is what keeps a provider's English stack trace or a
 * moderation category name from ever reaching a parent (master prompt §17, §44).
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => deviceLocale());

  const value = useMemo<I18nValue>(() => {
    const translator = createTranslator(locale);

    return {
      ...translator,
      setLocale,
      errorCopy: (error: unknown) => {
        if (isApiError(error)) {
          return translator.error(error.code);
        }
        // Anything that is not an ApiError never came from the server, so it is
        // a bug in the app; the parent still gets a sentence rather than a
        // silent failure.
        return translator.error('INTERNAL_ERROR' as ClientErrorCode);
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside an I18nProvider');
  }
  return context;
}
