import { describe, expect, it } from 'vitest';
import { decideGate, type GateInput } from './app-gate';

const base: GateInput = {
  configPending: false,
  updateRequired: false,
  sessionStatus: 'authenticated',
  inOnboarding: false,
  onboardingCompleted: true,
};

describe('decideGate', () => {
  it('holds everything while the launch config is unanswered', () => {
    expect(decideGate({ ...base, configPending: true })).toEqual({ kind: 'wait' });
  });

  // The bug this file exists for. On a cold server the config query stays in
  // flight for tens of seconds while the session resolves from the Keychain
  // immediately. A gate that opens on the session alone puts a signed-out
  // parent on the signed-in tabs, where every query 401s and the skeletons
  // never resolve — which is exactly what shipped in the first Android build.
  it('does not open for a signed-out parent while the config is unanswered', () => {
    expect(
      decideGate({ ...base, configPending: true, sessionStatus: 'anonymous' }),
    ).toEqual({ kind: 'wait' });
  });

  it('sends a signed-out parent to onboarding once the config has answered', () => {
    expect(decideGate({ ...base, sessionStatus: 'anonymous' })).toEqual({
      kind: 'redirect',
      to: '/(onboarding)/welcome',
    });
  });

  it('leaves a signed-out parent alone once they are in onboarding', () => {
    expect(
      decideGate({ ...base, sessionStatus: 'anonymous', inOnboarding: true }),
    ).toEqual({ kind: 'render' });
  });

  it('bounces a returning parent out of onboarding', () => {
    expect(decideGate({ ...base, inOnboarding: true })).toEqual({
      kind: 'redirect',
      to: '/(tabs)',
    });
  });

  it('lets a signed-in parent finish onboarding they have not completed', () => {
    expect(
      decideGate({ ...base, inOnboarding: true, onboardingCompleted: false }),
    ).toEqual({ kind: 'render' });
  });

  it('refuses an unsupported build before anything else', () => {
    // Ahead of the config gate on purpose: `updateRequired` can only be true
    // once the config has answered, and a build that cannot talk to the API
    // must not be waved through by any later branch.
    expect(
      decideGate({
        ...base,
        updateRequired: true,
        sessionStatus: 'anonymous',
        configPending: true,
      }),
    ).toEqual({ kind: 'update-required' });
  });

  it('waits while the session itself is still resolving', () => {
    expect(decideGate({ ...base, sessionStatus: 'loading' })).toEqual({ kind: 'wait' });
  });
});
