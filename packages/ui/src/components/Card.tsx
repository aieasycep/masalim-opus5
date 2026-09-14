import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { ShadowToken } from '../tokens';

export interface CardProps extends ViewProps {
  /** `flat` has a hairline border instead of a shadow, for dense lists. */
  variant?: 'raised' | 'flat' | 'muted' | undefined;
  padding?: number | undefined;
  radiusToken?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | undefined;
  shadow?: ShadowToken | undefined;
  /** When set the whole card becomes one touch target. */
  onPress?: (() => void) | undefined;
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  children?: React.ReactNode | undefined;
}

/**
 * The surface almost everything sits on.
 *
 * A card that takes an `onPress` renders as a button rather than a view with a
 * tap handler, so a screen reader announces it as something that can be
 * activated instead of reading its contents as inert text.
 */
export function Card({
  variant = 'raised',
  padding,
  radiusToken = 'lg',
  shadow,
  onPress,
  accessibilityLabel,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const surface: ViewStyle = {
    backgroundColor: variant === 'muted' ? theme.colors.muted : theme.colors.card,
    borderRadius: theme.radius[radiusToken],
    padding: padding ?? theme.spacing.base,
    ...(variant === 'flat'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }
      : theme.shadows[shadow ?? 'card']),
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        onPress={onPress}
        style={({ pressed }) => [surface, pressed ? styles.pressed : null, style]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[surface, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9 },
});
