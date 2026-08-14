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
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
    revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  },
};

export default config;
