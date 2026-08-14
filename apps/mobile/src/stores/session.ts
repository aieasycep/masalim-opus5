import { create } from 'zustand';
import type { AuthSession, UserDto } from '@masalim/types';
import { api, setUnauthenticatedHandler } from '../lib/api';
import { tokenStore } from '../lib/token-store';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: UserDto | null;
  /** Whichever child the app is currently acting on behalf of. */
  selectedChildId: string | null;

  restore: () => Promise<void>;
  adopt: (session: AuthSession) => Promise<void>;
  setUser: (user: UserDto) => void;
  selectChild: (childId: string | null) => void;
  signOut: () => Promise<void>;
}

/**
 * Who is signed in.
 *
 * Deliberately small: the user record and everything derived from it are server
 * state and live in the query cache. What belongs here is the one thing a cache
 * cannot answer — whether the app should be showing the signed-in world at all.
 */
export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  selectedChildId: null,

  /**
   * Restores a session on launch.
   *
   * The stored token is *verified* by fetching the user rather than trusted: a
   * token survives an account deletion, a password change and a revoked device,
   * and starting the app into a signed-in shell that then 401s on every screen
   * is worse than one honest sign-in prompt.
   */
  restore: async () => {
    if (!(await tokenStore.hasSession())) {
      set({ status: 'anonymous', user: null });
      return;
    }

    try {
      const user = await api.users.me();
      set({ status: 'authenticated', user });
    } catch {
      await tokenStore.clear();
      set({ status: 'anonymous', user: null });
    }
  },

  adopt: async (session) => {
    await tokenStore.setTokens(session.tokens);
    set({ status: 'authenticated', user: session.user });
  },

  setUser: (user) => {
    set({ user });
  },

  selectChild: (childId) => {
    set({ selectedChildId: childId });
  },

  signOut: async () => {
    const refreshToken = await tokenStore.getRefreshToken();

    // Revoking server-side is best-effort: a parent who taps sign out on a
    // plane must still end up signed out on the device.
    if (refreshToken) {
      await api.auth.signOut(refreshToken).catch(() => undefined);
    }

    await tokenStore.clear();
    set({ status: 'anonymous', user: null, selectedChildId: null });
    void get;
  },
}));

/** Wires an expired session to the store, once, at module load. */
setUnauthenticatedHandler(() => {
  useSession.setState({ status: 'anonymous', user: null, selectedChildId: null });
});
