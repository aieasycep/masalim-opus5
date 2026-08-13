/**
 * Colour tokens, taken verbatim from the Figma export's CSS custom properties.
 *
 * Nothing outside this file may contain a hex literal — that rule is what keeps
 * every screen consistent as the app grows.
 */

/**
 * The colour contract every theme satisfies.
 *
 * Declared as an interface with `string` values rather than inferred from one
 * palette: literal hex types from two themes intersect to `never`, which makes
 * `theme.colors.primary` unusable.
 */
export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  /** Night only: a surface raised above `card`. */
  surface?: string;

  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;

  muted: string;
  mutedForeground: string;

  accent: string;
  accentForeground: string;

  border: string;
  ring: string;

  destructive: string;
  destructiveForeground: string;
  success: string;
  warning: string;

  overlay: string;
}

/** Daytime palette: warm cream, soft lavender, coral accent. */
export const lightColors: ThemeColors = {
  background: '#FAF8F4',
  foreground: '#2C2825',
  card: '#FFFFFF',
  cardForeground: '#2C2825',

  primary: '#7C5CBF',
  primaryForeground: '#FFFFFF',
  secondary: '#EDE8F8',
  secondaryForeground: '#5A4190',

  muted: '#F2EDE6',
  mutedForeground: '#8A7D72',

  accent: '#F08B6E',
  accentForeground: '#FFFFFF',

  border: '#E8E0D4',
  ring: '#B09CE0',

  destructive: '#E05454',
  destructiveForeground: '#FFFFFF',
  success: '#8DB89A',
  warning: '#E8A33D',

  overlay: 'rgba(44, 40, 37, 0.45)',
};

/**
 * Night palette for the audio player and generation screens.
 *
 * A child may be in a dark room at bedtime, so these screens are designed dark
 * first rather than dimmed versions of the light ones.
 */
export const nightColors: ThemeColors = {
  background: '#0D1B2E',
  foreground: '#E8E0D4',
  card: '#162035',
  cardForeground: '#E8E0D4',
  surface: '#1E2D45',

  primary: '#9B7FD4',
  primaryForeground: '#FFFFFF',
  secondary: '#1E2D45',
  secondaryForeground: '#B09CE0',

  muted: '#162035',
  mutedForeground: '#6B7A94',

  accent: '#F08B6E',
  accentForeground: '#FFFFFF',

  border: 'rgba(255, 255, 255, 0.12)',
  ring: '#9B7FD4',

  destructive: '#E05454',
  destructiveForeground: '#FFFFFF',
  success: '#8DB89A',
  warning: '#E8A33D',

  overlay: 'rgba(13, 27, 46, 0.7)',
};

/** Brand palette used for illustration accents, chips and decorative shapes. */
export const palette = {
  lavender: '#B09CE0',
  lavenderLight: '#D4C8F0',
  dustyBlue: '#7BA7C9',
  peach: '#F5C4A8',
  sage: '#8DB89A',
  coral: '#F08B6E',
  cream: '#FAF8F4',
  warmWhite: '#FFF9F2',
  gold: '#FFD97D',

  nightDeep: '#1A0F3C',
  nightIndigo: '#2D1B69',
  nightBlue: '#4A7FB5',
  nightPurple: '#9B7FD4',
} as const;

/** Gradients, as ordered colour stops for `expo-linear-gradient`. */
export const gradients = {
  /** Primary call to action. */
  cta: {
    colors: ['#9B7FD4', '#7C5CBF'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Home hero card. */
  hero: {
    colors: ['#2D1B69', '#7C5CBF', '#9B7FD4'] as const,
    locations: [0, 0.6, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Splash, generating and voice recording backgrounds. */
  night: {
    colors: ['#1A0F3C', '#2D1B69', '#0D1B2E'] as const,
    locations: [0, 0.5, 1] as const,
    start: { x: 0.2, y: 0 },
    end: { x: 0.8, y: 1 },
  },
  /** Parent voice avatars — warm, to distinguish them from system voices. */
  parentVoice: {
    colors: ['#F5C4A8', '#F08B6E'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** System voice avatars. */
  systemVoice: {
    colors: ['#D4C8F0', '#B09CE0'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Child avatar placeholder. */
  childAvatar: {
    colors: ['#D4C8F0', '#EDE8F8'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

export type ColorScheme = ThemeColors;
export type ColorToken = keyof ThemeColors;
