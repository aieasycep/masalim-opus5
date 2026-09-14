import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpAnalyticsProvider } from './http-provider';
import type { AnalyticsEvent } from '@masalim/types';

const EVENT = 'story_generated' as AnalyticsEvent;

function makeFetch() {
  return vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls[0];
  return JSON.parse((call?.[1] as RequestInit).body as string) as {
    api_key: string;
    batch: Array<{
      event: string;
      distinct_id: string;
      timestamp: string;
      properties: Record<string, unknown>;
    }>;
  };
}

describe('HttpAnalyticsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a single event back rather than sending one request per capture', () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.capture(EVENT);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends once the batch fills', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    for (let i = 0; i < 20; i += 1) provider.capture(EVENT);
    await vi.runAllTimersAsync();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchImpl as never).batch).toHaveLength(20);
  });

  it('sends a waiting event after the flush interval', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.capture(EVENT);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('drops the oldest events rather than growing without bound', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    // Far more than the cap, with every send failing.
    for (let i = 0; i < 500; i += 1) provider.capture(EVENT);
    await vi.runAllTimersAsync();

    // The queue is bounded, so this resolves rather than accumulating forever.
    await expect(provider.flush()).resolves.toBeUndefined();
  });

  it('never rejects when the network fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('DNS');
    }) as unknown as typeof fetch;
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.capture(EVENT);

    await expect(provider.flush()).resolves.toBeUndefined();
  });

  it('attributes events to the identified account', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.identify('user_123');
    provider.capture(EVENT);
    await provider.flush();

    const sent = bodyOf(fetchImpl as never);
    expect(sent.batch.every((entry) => entry.distinct_id === 'user_123')).toBe(true);
  });

  it('sends anonymously before anyone is identified', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.capture(EVENT);
    await provider.flush();

    expect(bodyOf(fetchImpl as never).batch[0]?.distinct_id).toBe('anonymous');
  });

  it('discards queued events on reset, so they cannot be sent under a new identity', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example', fetchImpl);

    provider.identify('user_123');
    provider.capture(EVENT);
    provider.reset();
    await provider.flush();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stamps each event with the time it was captured', async () => {
    const fetchImpl = makeFetch();
    const instants = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:05.000Z'];
    let call = 0;
    const provider = new HttpAnalyticsProvider(
      'key',
      'https://ph.example',
      fetchImpl,
      () => new Date(instants[call++] ?? instants[0]!),
    );

    provider.capture(EVENT);
    provider.capture(EVENT);
    await provider.flush();

    const sent = bodyOf(fetchImpl as never);
    expect(sent.batch.map((entry) => entry.timestamp)).toEqual(instants);
  });

  it('tolerates a host with a trailing slash', async () => {
    const fetchImpl = makeFetch();
    const provider = new HttpAnalyticsProvider('key', 'https://ph.example/', fetchImpl);

    provider.capture(EVENT);
    await provider.flush();

    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'https://ph.example/batch/',
    );
  });
});
