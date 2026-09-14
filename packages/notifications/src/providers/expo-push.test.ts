import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpoPushProvider } from './expo-push';
import { MockPushProvider } from './mock-push';
import type { PushMessage, PushRecipient } from '../types';

const message: PushMessage = {
  type: 'STORY_READY',
  title: 'Masalın hazır ✨',
  body: 'Ege ve Kayıp Yıldız seni bekliyor.',
  deepLink: 'masalim://story/abc123',
};

function recipients(count: number, prefix = 'ExponentPushToken[t'): PushRecipient[] {
  return Array.from({ length: count }, (_unused, index) => ({
    token: `${prefix}${String(index)}]`,
    platform: 'IOS' as const,
    locale: 'tr' as const,
  }));
}

describe('mock push provider', () => {
  it('records what it was asked to send', async () => {
    const provider = new MockPushProvider();
    await provider.send(recipients(2), message);

    expect(provider.outbox()).toHaveLength(1);
    expect(provider.outbox()[0]?.message.deepLink).toBe('masalim://story/abc123');
  });

  it('reports a dead device so the caller can stop retrying', async () => {
    const provider = new MockPushProvider();
    const results = await provider.send(
      [{ token: 'invalid-gone', platform: 'ANDROID', locale: 'tr' }],
      message,
    );

    expect(results[0]?.delivered).toBe(false);
    expect(results[0]?.permanentlyInvalid).toBe(true);
  });
});

describe('expo push provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('splits a large audience into batches Expo will accept', async () => {
    const calls: unknown[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as unknown[];
        calls.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: body.map(() => ({ status: 'ok' })) }),
        };
      }),
    );

    const provider = new ExpoPushProvider();
    const results = await provider.send(recipients(250), message);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toHaveLength(100);
    expect(calls[2]).toHaveLength(50);
    expect(results).toHaveLength(250);
    expect(results.every((result) => result.delivered)).toBe(true);
  });

  it('marks an uninstalled app as permanently invalid, and nothing else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', details: { error: 'MessageRateExceeded' } },
          ],
        }),
      })),
    );

    const provider = new ExpoPushProvider('token');
    const results = await provider.send(recipients(3), message);

    expect(results[0]).toMatchObject({ delivered: true, permanentlyInvalid: false });
    expect(results[1]).toMatchObject({ delivered: false, permanentlyInvalid: true });
    // Rate limiting is temporary; disabling the device would lose a real user.
    expect(results[2]).toMatchObject({ delivered: false, permanentlyInvalid: false });
  });

  it('treats a transport failure as temporary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );

    const provider = new ExpoPushProvider();
    const results = await provider.send(recipients(2), message);

    expect(results.every((result) => !result.delivered)).toBe(true);
    expect(results.every((result) => !result.permanentlyInvalid)).toBe(true);
    expect(results[0]?.errorCode).toBe('http_503');
  });

  it('carries the deep link so tapping the notification lands on the story', async () => {
    let sent: Array<{ data?: { deepLink?: string } }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        sent = JSON.parse(init.body) as typeof sent;
        return { ok: true, status: 200, json: async () => ({ data: [{ status: 'ok' }] }) };
      }),
    );

    await new ExpoPushProvider().send(recipients(1), message);

    expect(sent[0]?.data?.deepLink).toBe('masalim://story/abc123');
  });
});
