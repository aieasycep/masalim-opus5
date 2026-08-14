import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

interface Extra {
  apiUrl?: string;
  appEnv?: string;
  revenueCatIosKey?: string;
  revenueCatAndroidKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * Everything the bundle is allowed to know.
 *
 * Only public values live here. RevenueCat's *public* SDK keys are safe to ship
 * — they identify the app to the store, they do not authorise anything — while
 * the secret API key stays on the server, which is also the only place that can
 * grant an entitlement.
 */
export const env = {
  apiUrl: extra.apiUrl ?? 'http://localhost:3000',
  appEnv: extra.appEnv ?? 'development',
  isProduction: extra.appEnv === 'production',
  appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0',
  buildVersion: Application.nativeBuildVersion ?? '1',
  platform: (Platform.OS === 'ios' ? 'IOS' : 'ANDROID') as 'IOS' | 'ANDROID',
  revenueCatKey:
    Platform.OS === 'ios'
      ? (extra.revenueCatIosKey ?? '')
      : (extra.revenueCatAndroidKey ?? ''),
} as const;
