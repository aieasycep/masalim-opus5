import type { ExpoConfig } from 'expo/config';

/**
 * Expo configuration.
 *
 * Read from the environment rather than hard-coded so the same source produces
 * a development build against localhost and a store build against production —
 * `EXPO_PUBLIC_` variables are the only ones that reach the bundle, and nothing
 * secret is ever among them.
 */
const config: ExpoConfig = {
  name: 'Masalım',
  slug: 'masalim',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'masalim',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  backgroundColor: '#FAF8F4',

  /**
   * Native only. Expo's default includes `web`, which makes `expo export` demand
   * react-native-web — a runtime this app has no use for: recording leans on
   * expo-audio's native metering, tokens live in the Keychain/Keystore through
   * SecureStore, and narration keeps playing under a locked screen. Declaring the
   * two platforms we actually ship keeps the export honest.
   */
  platforms: ['ios', 'android'],

  splash: {
    backgroundColor: '#1A0F3C',
    resizeMode: 'contain',
  },

  ios: {
    bundleIdentifier: 'app.masalim.ios',
    supportsTablet: false,
    infoPlist: {
      // Turkish, because that is the audience — everything else follows.
      CFBundleDevelopmentRegion: 'tr',
      NSMicrophoneUsageDescription:
        'Kendi sesinle masal okuyabilmen için ses kaydı almamız gerekiyor. Kaydını istediğin zaman silebilirsin.',
      NSPhotoLibraryUsageDescription:
        'Çocuğunun profil fotoğrafını seçebilmen için galerine erişmemiz gerekiyor.',
      // Narration continues while the phone is locked and the child falls asleep.
      UIBackgroundModes: ['audio'],
    },
  },

  android: {
    package: 'app.masalim.android',
    adaptiveIcon: { backgroundColor: '#7C5CBF' },
    permissions: ['RECORD_AUDIO', 'READ_MEDIA_IMAGES', 'POST_NOTIFICATIONS'],
    edgeToEdgeEnabled: true,
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-audio',
      {
        microphonePermission:
          'Kendi sesinle masal okuyabilmen için ses kaydı almamız gerekiyor.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Çocuğunun profil fotoğrafını seçebilmen için galerine erişmemiz gerekiyor.',
      },
    ],
    ['expo-splash-screen', { backgroundColor: '#1A0F3C', resizeMode: 'contain' }],
  ],

  experiments: { typedRoutes: true },

  extra: {
    // How EAS knows which project on expo.dev a build belongs to. A static
    // app.json would carry it as a literal; this config is generated, so EAS
    // cannot write it back, and it is committed here instead. Not a secret —
    // it names a project, and building against it still requires an account
    // token. The override exists so a fork can build under its own account
    // without editing this file.
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ?? '1921844d-0dba-4de8-814c-8d6f7745b80f',
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
    revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
    // Absent in most builds, and that is the intended default: with no key the
    // client stays on the no-op provider rather than half-reporting.
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '',
  },
};

export default config;
