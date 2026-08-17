import type { ListStoriesInput } from '@masalim/validation';

/**
 * Every cache key, derived from one root.
 *
 * Hierarchical on purpose: invalidating `queryKeys.stories.all` after a story is
 * created also clears every filtered list and every detail, which is what stops
 * the Library showing a stale shelf the moment a parent goes back to it.
 */
export const queryKeys = {
  app: {
    config: ['app', 'config'] as const,
    home: ['app', 'home'] as const,
  },
  user: {
    all: ['user'] as const,
    me: ['user', 'me'] as const,
    notificationPreferences: ['user', 'notification-preferences'] as const,
    audioPreferences: ['user', 'audio-preferences'] as const,
    privacyPreferences: ['user', 'privacy-preferences'] as const,
  },
  children: {
    all: ['children'] as const,
    list: () => ['children', 'list'] as const,
    detail: (id: string) => ['children', 'detail', id] as const,
    interests: ['children', 'interests'] as const,
  },
  stories: {
    all: ['stories'] as const,
    list: (input: Partial<ListStoriesInput> = {}) => ['stories', 'list', input] as const,
    detail: (id: string) => ['stories', 'detail', id] as const,
    narrations: (id: string) => ['stories', id, 'narrations'] as const,
    illustrations: (id: string) => ['stories', id, 'illustrations'] as const,
  },
  jobs: {
    detail: (id: string) => ['jobs', id] as const,
  },
  voices: {
    all: ['voices'] as const,
    list: () => ['voices', 'list'] as const,
    detail: (id: string) => ['voices', 'detail', id] as const,
    consent: ['voices', 'consent'] as const,
    script: ['voices', 'script'] as const,
    system: ['voices', 'system'] as const,
    narrators: ['voices', 'narrators'] as const,
  },
  narrations: {
    detail: (id: string) => ['narrations', id] as const,
    segments: (id: string) => ['narrations', id, 'segments'] as const,
  },
  illustrationSets: {
    detail: (id: string) => ['illustration-sets', id] as const,
  },
  books: {
    all: ['books'] as const,
    list: () => ['books', 'list'] as const,
    detail: (id: string) => ['books', 'detail', id] as const,
    renders: (id: string) => ['books', id, 'renders'] as const,
  },
  addresses: {
    all: ['addresses'] as const,
    list: () => ['addresses', 'list'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: () => ['orders', 'list'] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    products: ['orders', 'products'] as const,
  },
  subscription: {
    all: ['subscription'] as const,
    current: ['subscription', 'current'] as const,
    entitlements: ['subscription', 'entitlements'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: ['notifications', 'list'] as const,
  },
} as const;
