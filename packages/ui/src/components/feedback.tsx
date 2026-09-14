import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped rather than overflowing. */
  value: number;
  /** Announced label, e.g. "3 / 12 görsel". */
  label?: string | undefined;
  height?: number | undefined;
  trackColor?: string | undefined;
  fillColor?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A determinate progress bar.
 *
 * Only ever driven by a real ratio. The generation screens pass completed steps
 * over total steps, because a bar that animates on a timer while nothing is
 * happening is a lie a parent eventually catches (§29).
 */
export function ProgressBar({
  value,
  label,
  height = 8,
  trackColor,
  fillColor,
  style,
}: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const width = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: theme.durations.normal,
      // Width cannot be driven on the native thread; the alternative is a
      // scaleX transform, which blurs the rounded cap.
      useNativeDriver: false,
    }).start();
  }, [clamped, theme.durations.normal, width]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      {...(label ? { accessibilityLabel: label } : {})}
      style={[
        styles.track,
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor ?? theme.colors.muted,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            borderRadius: height / 2,
            backgroundColor: fillColor ?? theme.colors.primary,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

export interface SkeletonProps {
  width?: number | `${number}%` | undefined;
  height?: number | undefined;
  radiusToken?: 'xs' | 'sm' | 'md' | 'lg' | 'full' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A placeholder while content loads.
 *
 * Pulses gently rather than sweeping a shimmer across: this app is used at
 * bedtime, and a moving highlight in a dark room is the opposite of calm.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radiusToken = 'sm',
  style,
}: SkeletonProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          opacity,
          borderRadius: theme.radius[radiusToken],
          backgroundColor: theme.colors.muted,
        },
        style,
      ]}
    />
  );
}

export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'premium' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  const surfaces: Record<NonNullable<BadgeProps['tone']>, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.muted, fg: theme.colors.mutedForeground },
    primary: { bg: theme.colors.secondary, fg: theme.colors.secondaryForeground },
    success: { bg: theme.colors.secondary, fg: theme.colors.success },
    warning: { bg: theme.colors.muted, fg: theme.colors.warning },
    destructive: { bg: theme.colors.muted, fg: theme.colors.destructive },
    premium: { bg: theme.palette.gold, fg: theme.colors.foreground },
  };

  const surface = surfaces[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: surface.bg, borderRadius: theme.radius.full },
        style,
      ]}
    >
      <Text variant="micro" style={{ color: surface.fg }}>
        {label}
      </Text>
    </View>
  );
}

export interface DividerProps {
  spacing?: number | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Divider({ spacing = 0, style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: theme.colors.border,
          marginVertical: spacing,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: '100%' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
