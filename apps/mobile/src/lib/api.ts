import { getLocales } from 'expo-localization';
import { createEndpoints, HttpClient, type Endpoints } from '@masalim/api-client';
import { resolveLocale } from '@masalim/localization';
import type { Locale } from '@masalim/types';
import { env } from '../config/env';
import { tokenStore } from './token-store';

/** The device's language, narrowed to what the app actually ships. */
export function deviceLocale(): Locale {
  return resolveLocale(getLocales()[0]?.languageCode ?? null);
}

let onUnauthenticated: (() => void) | null = null;

/**
 * Lets the session store hook into the client without the client importing it.
 *
 * The dependency only runs one way — the HTTP layer knows nothing about
 * navigation or state, it just reports that the session is gone.
 */
export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

export const http = new HttpClient({
  baseUrl: env.apiUrl,
  tokens: tokenStore,
  appVersion: env.appVersion,
  platform: env.platform,
  locale: deviceLocale(),
  onUnauthenticated: () => {
    onUnauthenticated?.();
  },
});

export const api: Endpoints = createEndpoints(http);
