import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { TextVariant } from '../tokens';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Semantic colour role; falls back to the theme's foreground. */
  tone?: 'default' | 'muted' | 'primary' | 'accent' | 'inverse' | 'destructive' | 'success';
  align?: TextStyle['textAlign'];
  children?: React.ReactNode;
}

/**
 * Every piece of text in the app goes through here.
 *
 * Screens pick a variant and a tone rather than assembling font family, size,
 * weight and colour by hand, which is what keeps 50-odd screens looking like one
 * product. Font scaling is left enabled so the app honours the reader's system
 * text size, capped so a very large setting cannot break a card's layout.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const toneColors: Record<NonNullable<TextProps['tone']>, string> = {
    default: theme.colors.foreground,
    muted: theme.colors.mutedForeground,
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    inverse: theme.colors.primaryForeground,
    destructive: theme.colors.destructive,
    success: theme.colors.success,
  };

  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        theme.text[variant],
        { color: toneColors[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
