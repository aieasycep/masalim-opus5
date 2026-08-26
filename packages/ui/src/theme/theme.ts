import {
  durations,
  gradients,
  lightColors,
  nightColors,
  palette,
  radius,
  shadows,
  spacing,
  textVariants,
  type ThemeColors,
} from '../tokens';

export type ThemeMode = 'light' | 'night';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: typeof shadows;
  text: typeof textVariants;
  gradients: typeof gradients;
  palette: typeof palette;
  durations: typeof durations;
}

const shared = {
  spacing,
  radius,
  shadows,
  text: textVariants,
  gradients,
  palette,
  durations,
} as const;

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  ...shared,
};

/**
 * Night theme.
 *
 * Not a dimmed variant of the light one: the player, the story generation
 * screen and voice recording are designed dark first, because a parent is using
 * them in a darkened room while a child falls asleep.
 */
export const nightTheme: Theme = {
  mode: 'night',
  colors: nightColors,
  ...shared,
};

export const themes: Record<ThemeMode, Theme> = {
  light: lightTheme,
  night: nightTheme,
};
