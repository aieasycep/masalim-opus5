import type { AuthTokens } from '@masalim/types';
import { ApiError } from './errors';

export interface TokenStore {
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  clear: () => Promise<void>;
}

export interface HttpClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called when the session is gone for good, so the app can return to sign-in. */
  onUnauthenticated?: () => void;
  /** Sent on every request; lets the server answer with the right version policy. */
  appVersion?: string;
  platform?: 'IOS' | 'ANDROID';
  locale?: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Replays safely on retry; the server keys on it. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skips the bearer token — used by sign-in, sign-up and the launch config. */
  anonymous?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The one place the app talks to the server.
 *
 * Two behaviours are worth stating outright:
 *
 * - A 401 triggers exactly one refresh attempt, and concurrent 401s share it.
 *   Without that, a screen that fires five queries on mount rotates the refresh
 *   token five times; the server treats reuse of a rotated token as theft and
 *   revokes the whole family, so the parent is signed out for being efficient.
 * - Every request carries an abortable timeout. A mobile connection that hangs
 *   without closing is the normal failure mode on a train, and a request with no
 *   deadline leaves a spinner on screen forever.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(path, options);

    if (response.status === 401 && !options.anonymous) {
      const refreshed = await this.refreshOnce();
      if (refreshed) {
        const retried = await this.send(path, options);
        return this.toResult<T>(retried);
      }

      await this.options.tokens.clear();
      this.options.onUnauthenticated?.();
    }

    return this.toResult<T>(response);
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /** Absolute URL for endpoints the app hands to another component, e.g. SSE. */
  url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async authHeader(): Promise<Record<string, string>> {
    const token = await this.options.tokens.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async send(path: string, options: RequestOptions): Promise<Response> {
    const url = new URL(this.url(path));
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(this.options.appVersion ? { 'X-App-Version': this.options.appVersion } : {}),
      ...(this.options.platform ? { 'X-App-Platform': this.options.platform } : {}),
      ...(this.options.locale ? { 'Accept-Language': this.options.locale } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (!options.anonymous) {
      Object.assign(headers, await this.authHeader());
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    // The caller's own cancellation (a screen unmounting) has to compose with
    // the timeout rather than replace it.
    const abort = () => {
      controller.abort();
    };
    options.signal?.addEventListener('abort', abort);

    try {
      return await fetch(url.toString(), {
        method: options.method ?? 'GET',
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      throw ApiError.network(error);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private async toResult<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const parsed: unknown = text.length > 0 ? safeJson(text) : null;

    if (!response.ok) {
      throw ApiError.fromResponse(response.status, parsed);
    }

    return parsed as T;
  }

  /** Refreshes at most once, with every concurrent caller awaiting the same attempt. */
  private async refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<boolean> {
    const refreshToken = await this.options.tokens.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(this.url('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const tokens = (await response.json()) as AuthTokens;
      if (!tokens.accessToken || !tokens.refreshToken) return false;

      await this.options.tokens.setTokens(tokens);
      return true;
    } catch {
      return false;
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
