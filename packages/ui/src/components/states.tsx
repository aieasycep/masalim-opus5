import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName | undefined;
  title: string;
  /** One sentence saying what to do next, never just "no data". */
  description?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * Nothing here yet.
 *
 * Always carries a way forward. An empty library that says only "boş" tells a
 * parent they have arrived somewhere useless; one that offers "İlk masalını
 * oluştur" tells them what the screen is for.
 */
export function EmptyState({
  icon = 'book',
  title,
  description,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.badge,
          { backgroundColor: theme.colors.secondary, borderRadius: theme.radius.xxl },
        ]}
      >
        <Icon name={icon} size={32} color={theme.colors.primary} />
      </View>
      <Text variant="h6" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          size="medium"
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title: string;
  description?: string | undefined;
  retryLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * Something went wrong.
 *
 * Deliberately the same shape as the empty state, with a retry rather than a
 * primary action — a parent who hits an error should not have to learn a new
 * layout to recover from it.
 */
export function ErrorState({ title, description, retryLabel, onRetry, style }: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]} accessibilityLiveRegion="polite">
      <View
        style={[
          styles.badge,
          { backgroundColor: theme.colors.muted, borderRadius: theme.radius.xxl },
        ]}
      >
        <Icon name="alert" size={32} color={theme.colors.destructive} />
      </View>
      <Text variant="h6" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {retryLabel && onRetry ? (
        <Button
          label={retryLabel}
          variant="secondary"
          onPress={onRetry}
          size="medium"
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export interface LoadingStateProps {
  label?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function LoadingState({ label, style }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {label ? (
        <Text variant="body" tone="muted" align="center" style={styles.description}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface OfflineBannerProps {
  message: string;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * The connection is gone.
 *
 * A banner rather than a blocking screen: cached stories are still readable and
 * downloaded audio still plays, so taking the whole app away would be a
 * self-inflicted outage.
 */
export function OfflineBanner({ message, style }: OfflineBannerProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { backgroundColor: theme.colors.muted, borderRadius: theme.radius.sm },
        style,
      ]}
    >
      <Icon name="offline" size={16} color={theme.colors.mutedForeground} />
      <Text variant="small" tone="muted" style={styles.bannerText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 4,
  },
  badge: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { marginBottom: 4 },
  description: { marginTop: 4, maxWidth: 300 },
  action: { marginTop: 20 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: { flex: 1 },
});
