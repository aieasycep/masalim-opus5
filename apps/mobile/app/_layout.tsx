import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '@masalim/api-client';
import { ThemeProvider, ToastProvider } from '@masalim/ui';
import { I18nProvider } from '../src/i18n';
import { useSession } from '../src/stores/session';
import { useNetworkStatus } from '../src/hooks/use-network-status';
import { AppGate } from '../src/components/AppGate';

// Held until fonts are loaded and the session is resolved, so the app never
// flashes a signed-out screen at somebody who is signed in.
void SplashScreen.preventAutoHideAsync();

const queryClient = createQueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const restore = useSession((state) => state.restore);
  const status = useSession((state) => state.status);
  const [restoreStarted, setRestoreStarted] = useState(false);

  useEffect(() => {
    if (restoreStarted) return;
    setRestoreStarted(true);
    void restore();
  }, [restore, restoreStarted]);

  const ready = (fontsLoaded || fontError !== null) && status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ThemeProvider>
              <ToastProvider>
                <StatusBar style="auto" />
                <NetworkWatcher />
                <AppGate>
                  <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="player/[narrationId]" options={{ presentation: 'modal' }} />
                    <Stack.Screen
                      name="subscription/index"
                      options={{ presentation: 'modal' }}
                    />
                  </Stack>
                </AppGate>
              </ToastProvider>
            </ThemeProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Keeps the query cache refetching when the connection comes back. */
function NetworkWatcher() {
  useNetworkStatus();
  return null;
}
