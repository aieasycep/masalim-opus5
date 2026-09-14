import { lightColors } from '@masalim/ui/tokens/colors';

/**
 * The palette as CSS custom properties.
 *
 * Generated from the shared tokens rather than written out, so the console
 * cannot drift from the app: `colors.ts` stays the only file in the repository
 * allowed to contain a hex literal.
 */
export const themeVariables: Record<string, string> = {
  '--background': lightColors.background,
  '--foreground': lightColors.foreground,
  '--card': lightColors.card,
  '--card-foreground': lightColors.cardForeground,
  '--primary': lightColors.primary,
  '--primary-foreground': lightColors.primaryForeground,
  '--secondary': lightColors.secondary,
  '--secondary-foreground': lightColors.secondaryForeground,
  '--muted': lightColors.muted,
  '--muted-foreground': lightColors.mutedForeground,
  '--accent': lightColors.accent,
  '--accent-foreground': lightColors.accentForeground,
  '--border': lightColors.border,
  '--ring': lightColors.ring,
  '--destructive': lightColors.destructive,
  '--destructive-foreground': lightColors.destructiveForeground,
  '--success': lightColors.success,
  '--warning': lightColors.warning,
};

/** Inline style object for the root element. */
export const themeStyle = themeVariables as React.CSSProperties;
