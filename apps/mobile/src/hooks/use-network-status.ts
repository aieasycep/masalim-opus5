import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { onlineManager, focusManager } from '@tanstack/react-query';

/**
 * Connectivity and foreground state.
 *
 * React Query's defaults assume a browser: it listens for `window` focus and
 * `navigator.onLine`, neither of which exists here. Without this wiring, a
 * parent who opens the app after a day would see yesterday's library until they
 * pulled to refresh, and a request made while offline would never be retried
 * when the signal returned.
 *
 * Reachability is inferred from whether requests succeed rather than from a
 * native network module: a phone can be attached to a captive-portal wifi and
 * report itself perfectly connected.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      setIsOnline(online);
    });

    const handleAppState = (state: AppStateStatus): void => {
      focusManager.setFocused(state === 'active');
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      unsubscribeOnline();
      subscription.remove();
    };
  }, []);

  return { isOnline };
}
