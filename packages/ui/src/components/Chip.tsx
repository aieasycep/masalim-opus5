import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  /** Rendered before the label — an emoji for interests, an icon for filters. */
  emoji?: string | undefined;
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  onPress?: (() => void) | undefined;
  size?: 'medium' | 'small' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * A selectable pill.
 *
 * Selection is carried by `accessibilityState.selected`, not by colour alone:
 * the interest grid and the library filters both rely on it, and colour is not
 * available to every reader.
 */
export function Chip({
  label,
  emoji,
  selected = false,
  disabled = false,
  onPress,
  size = 'medium',
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const height = size === 'small' ? 34 : MIN_TOUCH_TARGET;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPress={onPress}
      testID={testID}
      // The visual pill is smaller than the touch target on the small size, so
      // the gap is made up with hit slop rather than by growing the pill.
      hitSlop={size === 'small' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === 'small' ? 14 : 18,
          borderRadius: theme.radius.full,
          backgroundColor: selected ? theme.colors.primary : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
        selected ? theme.shadows.selected : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {emoji ? (
          <Text variant={size === 'small' ? 'small' : 'body'} accessibilityElementsHidden>
            {emoji}
          </Text>
        ) : null}
        <Text
          variant={size === 'small' ? 'smallBold' : 'title'}
          tone={selected ? 'inverse' : 'default'}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export interface ChipGroupProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle> | undefined;
}

/** Wrapping row of chips, with the 8pt gaps the brief specifies. */
export function ChipGroup({ children, style }: ChipGroupProps) {
  return <View style={[styles.group, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
