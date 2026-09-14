import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string | undefined;
  subtitle?: string | undefined;
  /** Omitted on root screens; present everywhere a parent can go back. */
  onBack?: (() => void) | undefined;
  backLabel?: string | undefined;
  /** Right-hand action, e.g. "Atla" on onboarding or a settings gear. */
  action?: React.ReactNode | undefined;
  align?: 'left' | 'center' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * The bar at the top of a screen.
 *
 * The title is marked as the accessibility header so a screen reader can jump
 * straight to it, which is how someone using VoiceOver orients on a new screen.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Geri',
  action,
  align = 'left',
  style,
}: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { paddingVertical: theme.spacing.md }, style]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {onBack ? (
            <IconButton
              name="back"
              accessibilityLabel={backLabel}
              onPress={onBack}
              size={40}
              iconSize={24}
            />
          ) : null}
        </View>

        {align === 'center' && title ? (
          <View style={styles.centreTitle}>
            <Text variant="h6" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={[styles.side, styles.sideEnd]}>{action}</View>
      </View>

      {align === 'left' && title ? (
        <View style={styles.leftTitle}>
          <Text variant="h1" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}

      {align === 'center' && subtitle ? (
        <Text variant="small" tone="muted" align="center" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  side: { minWidth: 40, justifyContent: 'center' },
  sideEnd: { alignItems: 'flex-end' },
  spacer: { flex: 1 },
  centreTitle: { flex: 1, alignItems: 'center' },
  leftTitle: { marginTop: 12 },
  subtitle: { marginTop: 6 },
});
