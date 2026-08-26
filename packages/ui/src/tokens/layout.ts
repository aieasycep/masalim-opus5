import type { ViewStyle } from 'react-native';

/** 8pt grid, as specified in the design brief. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  massive: 64,
} as const;

/** Horizontal gutter used by every screen. */
export const SCREEN_PADDING = spacing.xl;

/** Vertical gap between the major sections of a scrolling screen. */
export const SECTION_GAP = spacing.xl;

export const radius = {
  none: 0,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  /** Splash logo tile. */
  logo: 28,
  full: 9999,
} as const;

/**
 * Minimum touch target.
 *
 * 44pt is the accessibility floor from the brief, and it matters here: a tired
 * parent operating the player one-handed in a dark room should not have to aim.
 */
export const MIN_TOUCH_TARGET = 44;

export const shadows = {
  none: {},
  /** Resting cards in a list. */
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** Raised cards, e.g. "continue listening". */
  raised: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Primary call to action. */
  cta: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  /** Home hero card. */
  hero: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.3,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  /** Selected option cards in the wizard. */
  selected: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Bottom sheets and modals. */
  sheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;

/**
 * The Figma frame is 390pt wide. Absolute sizes taken from it are treated as
 * measurements at this width; anything that must fill the screen uses flex
 * instead, so the layout holds from a small iPhone to a large Android.
 */
export const DESIGN_WIDTH = 390;

export const durations = {
  instant: 120,
  fast: 200,
  normal: 300,
  slow: 400,
  /** Screen-level fades, matching the export's 0.5s fadeUp. */
  screen: 500,
} as const;
