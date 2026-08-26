import React from 'react';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string | undefined;
  icon?: IconName | undefined;
  leading?: React.ReactNode | undefined;
  /** Right-hand value text, e.g. the current language in Settings. */
  value?: string | undefined;
  onPress?: (() => void) | undefined;
  /** Turns the row into a toggle; `onPress` is ignored when set. */
  toggle?:
    { value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean } | undefined;
  tone?: 'default' | 'destructive' | undefined;
  showChevron?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * A settings row.
 *
 * A row with a toggle is one control, not two: the whole row flips the switch,
 * because a 40pt switch at the right edge of the screen is an unkind target for
 * a thumb — and the accessible role and state are on the row for the same reason.
 */
export function ListItem({
  title,
  subtitle,
  icon,
  leading,
  value,
  onPress,
  toggle,
  tone = 'default',
  showChevron,
  style,
  testID,
}: ListItemProps) {
  const theme = useTheme();
  const isToggle = toggle !== undefined;
  const interactive = isToggle || onPress !== undefined;
  const chevron = showChevron ?? (onPress !== undefined && !isToggle);
  const titleTone = tone === 'destructive' ? 'destructive' : 'default';

  const content = (
    <>
      {leading ??
        (icon ? (
          <View style={[styles.iconWell, { backgroundColor: theme.colors.muted }]}>
            <Icon
              name={icon}
              size={18}
              color={tone === 'destructive' ? theme.colors.destructive : theme.colors.foreground}
            />
          </View>
        ) : null)}

      <View style={styles.body}>
        <Text variant="body" tone={titleTone} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="small" tone="muted" numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {isToggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onValueChange}
          disabled={toggle.disabled ?? false}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          thumbColor={theme.colors.card}
          // The row already carries the role and state; the switch itself would
          // otherwise be announced a second time.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : chevron ? (
        <Icon name="forward" size={18} color={theme.colors.mutedForeground} />
      ) : null}
    </>
  );

  if (!interactive) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={title}
      {...(subtitle ? { accessibilityHint: subtitle } : {})}
      accessibilityState={
        isToggle ? { checked: toggle.value, disabled: toggle.disabled ?? false } : {}
      }
      disabled={isToggle ? (toggle.disabled ?? false) : false}
      onPress={() => {
        if (isToggle) toggle.onValueChange(!toggle.value);
        else onPress?.();
      }}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingVertical: 10,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  subtitle: { marginTop: 2 },
  pressed: { opacity: 0.7 },
});
