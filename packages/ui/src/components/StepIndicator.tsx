import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface StepIndicatorProps {
  /** 1-based. */
  current: number;
  total: number;
  /** "3 / 6" is announced as "Adım 3, toplam 6" with this label prefix. */
  labelPrefix?: string | undefined;
  showCount?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * Where a parent is in the wizard.
 *
 * Dots plus a count, not dots alone: six identical dots with one highlighted is
 * hard to read at a glance and impossible without colour, and a parent halfway
 * through a form wants to know how much is left.
 */
export function StepIndicator({
  current,
  total,
  labelPrefix = 'Adım',
  showCount = true,
  style,
}: StepIndicatorProps) {
  const theme = useTheme();
  const clamped = Math.max(1, Math.min(total, current));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${labelPrefix} ${String(clamped)}, toplam ${String(total)}`}
      accessibilityValue={{ min: 1, max: total, now: clamped }}
      style={[styles.container, style]}
    >
      <View style={styles.dots}>
        {Array.from({ length: total }, (_unused, index) => {
          const position = index + 1;
          const done = position <= clamped;
          return (
            <View
              key={position}
              style={[
                styles.dot,
                {
                  backgroundColor: done ? theme.colors.primary : theme.colors.border,
                  width: position === clamped ? 20 : 8,
                  borderRadius: 4,
                },
              ]}
            />
          );
        })}
      </View>

      {showCount ? (
        <Text variant="caption" tone="muted">
          {`${String(clamped)} / ${String(total)}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8 },
});
