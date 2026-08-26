import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './feedback';
import { Icon } from './Icon';
import { Text } from './Text';

export interface OptionCardProps {
  title: string;
  description?: string | undefined;
  /** Right-hand metadata: a duration, a price, a page count. */
  meta?: string | undefined;
  emoji?: string | undefined;
  leading?: React.ReactNode | undefined;
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Shows a lock and a Premium badge instead of the selection tick. */
  locked?: boolean | undefined;
  lockedLabel?: string | undefined;
  onPress?: (() => void) | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * A choice in the wizard, the narrator picker or the format picker.
 *
 * A locked option is still shown, still readable and still tappable — tapping it
 * opens the paywall rather than doing nothing. Hiding Premium options would make
 * the upgrade a surprise later; greying them out silently makes the app feel
 * broken (§36).
 */
export function OptionCard({
  title,
  description,
  meta,
  emoji,
  leading,
  selected = false,
  disabled = false,
  locked = false,
  lockedLabel = 'Premium',
  onPress,
  style,
  testID,
}: OptionCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={[title, description, locked ? lockedLabel : null]
        .filter(Boolean)
        .join('. ')}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderWidth: selected ? 2 : 1,
          padding: theme.spacing.base,
        },
        selected ? theme.shadows.selected : theme.shadows.card,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {leading ?? (emoji ? <Text variant="h4">{emoji}</Text> : null)}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="title" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {locked ? <Badge label={lockedLabel} tone="premium" /> : null}
        </View>
        {description ? (
          <Text variant="small" tone="muted" numberOfLines={2} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>

      {meta ? (
        <Text variant="small" tone="muted">
          {meta}
        </Text>
      ) : null}

      {locked ? (
        <Icon name="lock" size={18} color={theme.colors.mutedForeground} />
      ) : selected ? (
        <View style={[styles.tick, { backgroundColor: theme.colors.primary }]}>
          <Icon name="check" size={14} color={theme.colors.primaryForeground} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
  },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  description: {},
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
});
