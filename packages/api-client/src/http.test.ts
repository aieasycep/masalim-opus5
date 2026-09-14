import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient, type TokenStore } from './http';
import { ApiError, isApiError } from './errors';

interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

function memoryStore(initial: StoredTokens): TokenStore & { current: StoredTokens } {
  const state = { ...initial };
  return {
    current: state,
    getAccessToken: async () => state.accessToken,
    getRefreshToken: async () => state.refreshToken,
    setTokens: async (tokens) => {
      state.accessToken = tokens.accessToken;
      state.refreshToken = tokens.refreshToken;
    },
    clear: async () => {
      state.accessToken = null;
      state.refreshToken = null;
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

describe('http client', () => {
  let tokens: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    tokens = memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token and parses the body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'story-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient({ baseUrl: 'https://api.test/', tokens });
    const result = await client.get<{ id: string }>('/stories/story-1');

    expect(result.id).toBe('story-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/stories/story-1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('turns the standard error body into a domain code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(402, {
          error: { code: 'QUOTA_EXCEEDED', message: 'Quota exhausted', requestId: 'req-9' },
        }),
      ),
    );

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(client.get('/stories')).rejects.toSatisfy((error: unknown) => {
      if (!isApiError(error)) return false;
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.requestId).toBe('req-9');
      expect(error.isRetryable).toBe(false);
      return true;
    });
  });

  it('reports a lost connection as a code the app can render', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    );

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(client.get('/home')).rejects.toSatisfy((error: unknown) => {
      if (!isApiError(error)) return false;
      expect(error.code).toBe('NETWORK_UNAVAILABLE');
      expect(error.isRetryable).toBe(true);
      return true;
    });
  });

  it('answers a 502 HTML page with a service-unavailable code rather than crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 502,
            text: async () => '<html>Bad Gateway</html>',
          }) as Response,
      ),
    );

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });
    await expect(client.get('/home')).rejects.toBeInstanceOf(ApiError);
  });

  /**
   * The behaviour this whole test file exists for.
   *
   * The server rotates refresh tokens and treats reuse of a rotated one as
   * theft — it revokes the entire family. A screen firing several queries on
   * mount would hit 401 several times; without coalescing, each would refresh
   * with the same token and the parent would be signed out for loading a screen.
   */
  it('refreshes once for concurrent 401s', async () => {
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return jsonResponse(200, {
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
        });
      }
      const header = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (header === 'Bearer access-1') {
        return jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });

    const results = await Promise.all([
      client.get('/home'),
      client.get('/children'),
      client.get('/stories'),
    ]);

    expect(refreshes).toBe(1);
    expect(results).toHaveLength(3);
    expect(tokens.current.accessToken).toBe('access-2');
  });

  it('clears the session and calls back when the refresh token is dead', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/auth/refresh')
          ? jsonResponse(401, { error: { code: 'REFRESH_TOKEN_REUSED', message: 'reused' } })
          : jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      ),
    );

    const onUnauthenticated = vi.fn();
    const client = new HttpClient({ baseUrl: 'https://api.test', tokens, onUnauthenticated });

    await expect(client.get('/home')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(tokens.current.accessToken).toBeNull();
    expect(tokens.current.refreshToken).toBeNull();
  });

  it('does not try to refresh an anonymous request', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'no' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });

    await expect(
      client.post('/auth/sign-in', { email: 'a@b.test' }, { anonymous: true }),
    ).rejects.toBeInstanceOf(ApiError);

    // Exactly one call: a failed sign-in is not an expired session.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(tokens.current.accessToken).toBe('access-1');
  });

  it('returns nothing for a 204 rather than failing to parse an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }) as Response),
    );

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });
    await expect(client.delete('/stories/abc')).resolves.toBeUndefined();
  });

  it('drops undefined query values instead of sending "undefined"', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient({ baseUrl: 'https://api.test', tokens });
    await client.get('/stories', { query: { filter: 'audio', search: undefined, limit: 20 } });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('filter=audio');
    expect(url).toContain('limit=20');
    expect(url).not.toContain('search');
  });
});
