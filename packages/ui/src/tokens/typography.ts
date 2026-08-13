import type { TextStyle } from 'react-native';

/**
 * Type system, matching the Figma export.
 *
 * Two families, each with a job: Fraunces carries the storybook warmth in
 * headings and story text, Nunito keeps interface text plainly readable. Both
 * ship full Turkish glyph coverage, which is a hard requirement — a missing ı,
 * ğ or ş is immediately visible in a child's name.
 */
export const fontFamilies = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayRegular: 'Fraunces_400Regular',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'Nunito_500Medium',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyExtraBold: 'Nunito_800ExtraBold',
} as const;

export const fontSizes = {
  /** Splash wordmark. */
  hero: 48,
  /** Onboarding headlines. */
  display: 34,
  /** Screen titles. */
  h1: 30,
  /** Wizard step questions. */
  h2: 28,
  /** Section headers with a card. */
  h3: 26,
  /** Player title, result title. */
  h4: 24,
  /** Generating message. */
  h5: 22,
  /** Section headings. */
  h6: 18,
  /** Card titles. */
  title: 16,
  /** Primary button label. */
  button: 17,
  /** Body copy. */
  body: 15,
  bodyLarge: 16,
  /** Secondary copy, list subtitles. */
  small: 13,
  smallLarge: 14,
  /** Metadata, timestamps. */
  caption: 12,
  captionSmall: 11,
  /** Badges, eyebrow labels. */
  micro: 10,
} as const;

export const lineHeights = {
  tight: 1.2,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.6,
  /** Story text, where a parent is reading aloud. */
  story: 1.7,
} as const;

export const letterSpacing = {
  tighter: -0.02,
  tight: -0.01,
  normal: 0,
  wide: 0.04,
  wider: 0.06,
  widest: 0.08,
} as const;

export type TextVariant =
  | 'hero'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'title'
  | 'body'
  | 'bodyLarge'
  | 'bodyStory'
  | 'small'
  | 'smallBold'
  | 'caption'
  | 'micro'
  | 'eyebrow'
  | 'button'
  | 'buttonSmall';

/**
 * Ready-made styles so screens never assemble font/size/weight by hand.
 * `lineHeight` is resolved to absolute pixels because React Native does not
 * accept a unitless multiplier.
 */
export const textVariants: Record<TextVariant, TextStyle> = {
  hero: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.hero,
    lineHeight: fontSizes.hero * lineHeights.tight,
    letterSpacing: fontSizes.hero * letterSpacing.tighter,
  },
  display: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    lineHeight: fontSizes.display * lineHeights.tight,
    letterSpacing: fontSizes.display * letterSpacing.tight,
  },
  h1: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h1,
    lineHeight: fontSizes.h1 * lineHeights.tight,
    letterSpacing: fontSizes.h1 * letterSpacing.tight,
  },
  h2: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    lineHeight: fontSizes.h2 * lineHeights.tight,
    letterSpacing: fontSizes.h2 * letterSpacing.tight,
  },
  h3: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h3,
    lineHeight: fontSizes.h3 * lineHeights.tight,
    letterSpacing: fontSizes.h3 * letterSpacing.tight,
  },
  h4: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    lineHeight: fontSizes.h4 * lineHeights.tight,
    letterSpacing: fontSizes.h4 * letterSpacing.tight,
  },
  h5: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h5,
    lineHeight: fontSizes.h5 * lineHeights.snug,
  },
  h6: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h6,
    lineHeight: fontSizes.h6 * lineHeights.snug,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.title,
    lineHeight: fontSizes.title * lineHeights.snug,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.body,
    lineHeight: fontSizes.body * lineHeights.normal,
  },
  bodyLarge: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.bodyLarge,
    lineHeight: fontSizes.bodyLarge * lineHeights.relaxed,
  },
  /** Story prose, read aloud at bedtime. */
  bodyStory: {
    fontFamily: fontFamilies.displayRegular,
    fontSize: fontSizes.body,
    lineHeight: fontSizes.body * lineHeights.story,
  },
  small: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.small,
    lineHeight: fontSizes.small * lineHeights.normal,
  },
  smallBold: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.small,
    lineHeight: fontSizes.small * lineHeights.normal,
  },
  caption: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.caption,
    lineHeight: fontSizes.caption * lineHeights.normal,
  },
  micro: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.micro,
    lineHeight: fontSizes.micro * lineHeights.normal,
  },
  /** Uppercase label above a section, e.g. "YENİ MASAL". */
  eyebrow: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.caption,
    lineHeight: fontSizes.caption * lineHeights.normal,
    letterSpacing: fontSizes.caption * letterSpacing.wider,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.button,
    lineHeight: fontSizes.button * lineHeights.tight,
  },
  buttonSmall: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.small,
    lineHeight: fontSizes.small * lineHeights.tight,
  },
};
