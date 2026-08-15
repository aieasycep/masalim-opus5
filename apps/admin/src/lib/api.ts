import 'server-only';
import { redirect } from 'next/navigation';
import { readSessionToken } from './session';

/**
 * The API base URL.
 *
 * Deliberately not `NEXT_PUBLIC_`: every admin call is made from the server, so
 * the browser never needs to know where the API lives and the token never
 * leaves this process.
 */
const API_URL = process.env.ADMIN_API_URL ?? 'http://localhost:3000';

/**
 * Refuses a path that could retarget the call.
 *
 * Ids reach these helpers from route params and from form fields, both of which
 * a browser controls. A value like `../feature-flags/x` would otherwise walk the
 * URL sideways with the admin bearer still attached. Call sites should encode
 * their segments — this exists so that forgetting to is a loud failure rather
 * than a quiet one, since the roles guard is the only thing standing behind it.
 */
function assertSafePath(path: string): void {
  if (path.includes('..') || path.includes('//')) {
    throw new AdminApiError(0, 'UNSAFE_PATH', `Refusing to request a path with traversal: ${path}`);
  }
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Server-rendered pages read fresh state; nothing here is worth caching. */
  cache?: RequestCache;
}

/**
 * One authenticated call to the admin API.
 *
 * A 401 sends the operator to the sign-in page rather than rendering an error:
 * the only way to reach this code is with a session that has expired or been
 * revoked, and the useful response to that is the login form.
 *
 * Every other failure throws with the API's own error code intact, so a page
 * can tell "this order does not exist" from "the API is down" instead of
 * showing one shrug for both.
 */
export async function adminApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  assertSafePath(path);

  const token = await readSessionToken();
  if (!token) redirect('/login');

  const response = await fetch(`${API_URL}/${path.replace(/^\//, '')}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: options.cache ?? 'no-store',
  });

  if (response.status === 401) redirect('/login');

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new AdminApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? `Request failed with ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The unauthenticated call, used only by the login route handler. */
export async function adminApiPublic<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new AdminApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? `Request failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}
