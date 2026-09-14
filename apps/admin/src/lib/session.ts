import 'server-only';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'masalim_admin';

/**
 * Where the operator's token lives.
 *
 * An httpOnly cookie, set by a route handler on this origin — not
 * `localStorage`, and never in a client component. The admin token authorises
 * reading a family's shipping address and deleting an account; script-readable
 * storage would put that one XSS away from an attacker, and this console has no
 * public content to make XSS unlikely.
 *
 * `sameSite: strict` rather than `lax`, because there is no cross-site
 * navigation that should arrive already authenticated. Nothing here is a link
 * someone follows from an email.
 */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionToken(token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    // Plain HTTP is a local-development affordance only; anywhere else this is
    // a session that must not cross an unencrypted hop.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
