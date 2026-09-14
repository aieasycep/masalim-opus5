import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  name: IconName;
  /** Required: an icon alone tells a screen reader nothing. */
  accessibilityLabel: string;
  onPress?: (() => void) | undefined;
  variant?: 'plain' | 'surface' | 'primary' | undefined;
  size?: number | undefined;
  iconSize?: number | undefined;
  color?: string | undefined;
  disabled?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  size = MIN_TOUCH_TARGET,
  iconSize,
  color,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const theme = useTheme();

  const resolvedColor =
    color ?? (variant === 'primary' ? theme.colors.primaryForeground : undefined);

  const surfaces: Record<NonNullable<IconButtonProps['variant']>, ViewStyle> = {
    plain: { backgroundColor: 'transparent' },
    surface: { backgroundColor: theme.colors.card, ...theme.shadows.card },
    primary: { backgroundColor: theme.colors.primary },
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        surfaces[variant],
        { width: size, height: size, borderRadius: size / 2 },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Icon
        name={name}
        size={iconSize ?? Math.round(size * 0.45)}
        {...(resolvedColor ? { color: resolvedColor } : {})}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
