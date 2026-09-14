import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { Analytics, NoopAnalyticsProvider } from './analytics';
import { isForbiddenKey, redact } from './redaction';
import type { AnalyticsProvider } from './types';

describe('redaction', () => {
  it('drops the fields that would identify a family', () => {
    const safe = redact({
      childName: 'Ege',
      heroName: 'Ege',
      parentEmail: 'a@b.com',
      customPrompt: 'a story about Ege',
      storyTitle: 'Ege ve Ay',
      shippingCity: 'İstanbul',
      birthDate: '2019-09-04',
      ageRange: '4-6',
      durationTarget: 'medium',
      pageCount: 12,
    });

    expect(safe).toEqual({ ageRange: '4-6', durationTarget: 'medium', pageCount: 12 });
  });

  it('matches key fragments however they are cased or separated', () => {
    for (const key of ['name', 'childName', 'child_name', 'HERO_NAME', 'displayName']) {
      expect(isForbiddenKey(key)).toBe(true);
    }
    expect(isForbiddenKey('pageCount')).toBe(false);
  });

  it('drops long strings whatever the key is called', () => {
    const safe = redact({ note: 'x'.repeat(65), short: 'ok' });
    expect(safe).toEqual({ short: 'ok' });
  });

  it('treats a missing payload as an empty one', () => {
    expect(redact(undefined)).toEqual({});
  });
});

describe('consent', () => {
  function recorder() {
    const captured: Array<{ event: string; properties: unknown }> = [];
    const provider: AnalyticsProvider = {
      name: 'test',
      capture: (event, properties) => captured.push({ event, properties }),
      identify: () => undefined,
      reset: () => captured.push({ event: '__reset__', properties: null }),
      flush: async () => undefined,
    };
    return { captured, provider };
  }

  it('captures nothing before consent is given', () => {
    const { captured, provider } = recorder();
    const analytics = new Analytics({ appEnv: 'test' });
    analytics.setProvider(provider);

    analytics.capture(ANALYTICS_EVENTS.STORY_OPENED);
    expect(captured).toHaveLength(0);
  });

  it('does not replay what happened before consent', () => {
    const { captured, provider } = recorder();
    const analytics = new Analytics({ appEnv: 'test' });
    analytics.setProvider(provider);

    analytics.capture(ANALYTICS_EVENTS.STORY_OPENED);
    analytics.setConsent(true);
    analytics.capture(ANALYTICS_EVENTS.STORY_FAVOURITED);

    expect(captured.map((entry) => entry.event)).toEqual(['story_favourited']);
  });

  it('resets the identity when consent is withdrawn', () => {
    const { captured, provider } = recorder();
    const analytics = new Analytics({ appEnv: 'test' });
    analytics.setProvider(provider);

    analytics.setConsent(true);
    analytics.setConsent(false);
    analytics.capture(ANALYTICS_EVENTS.STORY_OPENED);

    expect(captured.map((entry) => entry.event)).toEqual(['__reset__']);
  });

  it('tags every event with the environment', () => {
    const { captured, provider } = recorder();
    const analytics = new Analytics({ appEnv: 'staging' });
    analytics.setProvider(provider);
    analytics.setConsent(true);

    analytics.capture(ANALYTICS_EVENTS.PAYWALL_VIEWED, { source: 'narrate' });

    expect(captured[0]?.properties).toEqual({ app_env: 'staging', source: 'narrate' });
  });

  it('never lets a throwing provider reach the caller', () => {
    const analytics = new Analytics({ appEnv: 'test' });
    analytics.setProvider({
      name: 'broken',
      capture: () => {
        throw new Error('vendor down');
      },
      identify: () => undefined,
      reset: () => undefined,
      flush: async () => undefined,
    });
    analytics.setConsent(true);

    expect(() => {
      analytics.capture(ANALYTICS_EVENTS.STORY_OPENED);
    }).not.toThrow();
  });

  it('defaults to a provider that does nothing', () => {
    const analytics = new Analytics({ appEnv: 'test' });
    expect(analytics.providerName).toBe(new NoopAnalyticsProvider().name);
  });
});
