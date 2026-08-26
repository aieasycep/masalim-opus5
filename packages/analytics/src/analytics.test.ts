import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsEvent } from '@masalim/types';
import { Analytics } from './analytics';
import type { AnalyticsProvider } from './types';

const EVENT = 'sign_in_completed' as AnalyticsEvent;
const OTHER = 'story_generated' as AnalyticsEvent;

function spyProvider() {
  return {
    name: 'spy',
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    flush: vi.fn(async () => undefined),
  } satisfies AnalyticsProvider;
}

function client(provider: AnalyticsProvider) {
  const analytics = new Analytics({ appEnv: 'test' });
  analytics.setProvider(provider);
  return analytics;
}

describe('Analytics consent', () => {
  it('releases events captured while the stored decision was still being read', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    // The sign-in that starts the session happens before the preferences fetch
    // resolves. Losing it is what made this event under-report rather than fail.
    analytics.capture(EVENT, { method: 'email' });
    expect(provider.capture).not.toHaveBeenCalled();

    analytics.resolveStoredConsent(true);

    expect(provider.capture).toHaveBeenCalledTimes(1);
    expect(provider.capture.mock.calls[0]?.[0]).toBe(EVENT);
  });

  it('throws the buffer away when the decision turns out to be no', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.capture(EVENT);
    analytics.resolveStoredConsent(false);

    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('never backfills after a real change of mind', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    // Decided: no. Everything from here is captured under a known refusal, so
    // agreeing later must not send any of it.
    analytics.resolveStoredConsent(false);
    analytics.capture(EVENT);
    analytics.capture(OTHER);

    analytics.setConsent(true);

    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('a decision made in settings releases nothing, even if the read never landed', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    // Preferences never resolved — offline at start-up — so the state is still
    // unknown when the parent turns analytics on by hand. Agreeing now says
    // nothing about the minutes before it.
    analytics.capture(EVENT);
    analytics.setConsent(true);

    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('a later refresh of the stored decision does not replay again', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.resolveStoredConsent(true);
    analytics.capture(EVENT);
    provider.capture.mockClear();

    // A refetch resolving the same value must not re-send anything.
    analytics.resolveStoredConsent(true);

    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('keeps buffered order when consent is granted', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.capture(EVENT);
    analytics.capture(OTHER);
    analytics.resolveStoredConsent(true);

    expect(provider.capture.mock.calls.map((call) => call[0])).toEqual([EVENT, OTHER]);
  });

  it('bounds the buffer rather than growing while consent is unresolved', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    for (let i = 0; i < 100; i += 1) analytics.capture(OTHER);
    analytics.resolveStoredConsent(true);

    expect(provider.capture.mock.calls.length).toBeLessThanOrEqual(32);
  });

  it('applies the pending identity before the events it belongs to', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.identify('user_1');
    analytics.capture(EVENT);
    analytics.resolveStoredConsent(true);

    expect(provider.identify.mock.calls[0]?.[0]).toBe('user_1');
    expect(provider.capture).toHaveBeenCalledTimes(1);
  });

  it('discards a pending buffer on reset, so a new session cannot inherit it', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.identify('user_1');
    analytics.capture(EVENT);
    analytics.reset();
    analytics.resolveStoredConsent(true);

    expect(provider.capture).not.toHaveBeenCalled();
    expect(provider.identify).not.toHaveBeenCalled();
  });

  it('withdrawing consent resets the provider so the device link does not survive it', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.resolveStoredConsent(true);
    analytics.setConsent(false);

    expect(provider.reset).toHaveBeenCalled();
  });

  it('strips a forbidden property key even from a buffered event', () => {
    const provider = spyProvider();
    const analytics = client(provider);

    analytics.capture(EVENT, { childName: 'Ege', age_band: 'AGE_3_5' });
    analytics.resolveStoredConsent(true);

    const properties = provider.capture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(properties).not.toHaveProperty('childName');
    expect(properties.age_band).toBe('AGE_3_5');
  });
});
