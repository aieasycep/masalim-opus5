import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Announced as the group's purpose, e.g. "Kütüphane filtresi". */
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/** A small set of mutually exclusive choices, laid out as one track. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={[
        styles.track,
        { backgroundColor: theme.colors.muted, borderRadius: theme.radius.full },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              onChange(option.value);
            }}
            style={[
              styles.segment,
              {
                borderRadius: theme.radius.full,
                backgroundColor: selected ? theme.colors.card : 'transparent',
              },
              selected ? theme.shadows.card : null,
            ]}
          >
            <Text
              variant="smallBold"
              tone={selected ? 'default' : 'muted'}
              numberOfLines={1}
              align="center"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
