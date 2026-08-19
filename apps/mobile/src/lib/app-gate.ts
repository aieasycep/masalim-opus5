import type { SessionStatus } from '../stores/session';

/**
 * What the app should be showing before any screen renders.
 *
 * Extracted from the component because the whole gate is one decision over five
 * booleans, and the component around it needs a router, a query client, a
 * session store and a translation context to exist at all. A wrong branch here
 * is not a subtle bug — it shows a signed-out parent somebody else's app — and
 * it should be provable without any of that.
 */
export type GateDecision =
  /** The build is below the supported floor and cannot talk to this API. */
  | { kind: 'update-required' }
  /** The launch config has not answered; show nothing rather than the wrong thing. */
  | { kind: 'wait' }
  /** Send them where they belong first; the destination renders after. */
  | { kind: 'redirect'; to: '/(onboarding)/welcome' | '/(tabs)' }
  /** They are in the right place. */
  | { kind: 'render' };

export interface GateInput {
  /** The config query has not produced an answer yet. */
  configPending: boolean;
  /** The config says this build is too old. Only meaningful once resolved. */
  updateRequired: boolean;
  sessionStatus: SessionStatus;
  /** The current route is inside the onboarding or auth group. */
  inOnboarding: boolean;
  onboardingCompleted: boolean;
}

export function decideGate({
  configPending,
  updateRequired,
  sessionStatus,
  inOnboarding,
  onboardingCompleted,
}: GateInput): GateDecision {
  if (updateRequired) return { kind: 'update-required' };

  // Nothing below can be decided without the config, and the session resolving
  // first is not permission to proceed: it comes back from the Keychain in
  // milliseconds while this query is still in flight against a server that may
  // be cold. Letting the session alone open the gate is what once put a
  // signed-out parent on the signed-in tabs, watching skeletons that could
  // never load.
  if (configPending) return { kind: 'wait' };

  if (sessionStatus === 'loading') return { kind: 'wait' };

  if (sessionStatus === 'anonymous') {
    return inOnboarding
      ? { kind: 'render' }
      : { kind: 'redirect', to: '/(onboarding)/welcome' };
  }

  // Signed in, but still on a welcome screen. Only bounce them out once they
  // have finished onboarding — a parent part-way through creating their first
  // child profile is signed in and belongs exactly where they are.
  if (inOnboarding && onboardingCompleted) {
    return { kind: 'redirect', to: '/(tabs)' };
  }

  return { kind: 'render' };
}
