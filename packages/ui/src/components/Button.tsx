import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
  fullWidth?: boolean | undefined;
  /** Rendered before the label, e.g. a play triangle on "Dinlemeye Başla". */
  leadingIcon?: React.ReactNode | undefined;
  trailingIcon?: React.ReactNode | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const HEIGHTS: Record<ButtonSize, number> = {
  large: 58,
  medium: 48,
  small: MIN_TOUCH_TARGET,
};

const PADDING: Record<ButtonSize, number> = {
  large: 24,
  medium: 20,
  small: 16,
};

/**
 * The primary action control.
 *
 * A loading button keeps its label in place and shows a spinner beside it
 * rather than swapping to a bare spinner — the label is what tells a parent
 * which action is in flight, and losing it makes the button appear to have
 * been replaced.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'large',
  loading = false,
  fullWidth = true,
  leadingIcon,
  trailingIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled === true || loading;

  const surfaces: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.primary },
    secondary: { backgroundColor: theme.colors.secondary },
    tertiary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    destructive: { backgroundColor: theme.colors.destructive },
  };

  const labelTones = {
    primary: 'inverse',
    secondary: 'primary',
    tertiary: 'default',
    destructive: 'inverse',
  } as const;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      hitSlop={size === 'small' ? 8 : 0}
      style={({ pressed }) => [
        styles.base,
        surfaces[variant],
        {
          height: HEIGHTS[size],
          paddingHorizontal: PADDING[size],
          borderRadius: theme.radius.lg,
        },
        variant === 'primary' && !isDisabled ? theme.shadows.cta : null,
        fullWidth ? styles.fullWidth : null,
        // A pressed state that dims rather than scales: the brief asks for calm
        // motion, and a springy button reads as a toy.
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === 'primary' || variant === 'destructive'
                ? theme.colors.primaryForeground
                : theme.colors.primary
            }
          />
        ) : (
          leadingIcon
        )}
        <Text
          variant={size === 'small' ? 'buttonSmall' : 'button'}
          tone={labelTones[variant]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {trailingIcon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
});
