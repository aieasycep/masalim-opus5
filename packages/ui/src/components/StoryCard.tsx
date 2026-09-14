import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './feedback';
import { Icon } from './Icon';
import { Text } from './Text';

export interface StoryCardProps {
  title: string;
  /** "Ege · 8 dk · Anne sesi" — already assembled and localised by the caller. */
  meta?: string | undefined;
  coverImageUrl?: string | null | undefined;
  /** Rendered over the cover, e.g. "Hazırlanıyor" while generation is running. */
  statusLabel?: string | undefined;
  hasAudio?: boolean | undefined;
  hasBook?: boolean | undefined;
  isFavourite?: boolean | undefined;
  layout?: 'grid' | 'row' | undefined;
  onPress?: (() => void) | undefined;
  onToggleFavourite?: (() => void) | undefined;
  favouriteLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * A story, as it appears on Home and in the Library.
 *
 * The cover falls back to a gradient rather than a grey box: a library of
 * un-illustrated stories should still look like a shelf of books, and a parent
 * recognises their own stories by position and title long before the artwork
 * arrives.
 */
export function StoryCard({
  title,
  meta,
  coverImageUrl,
  statusLabel,
  hasAudio = false,
  hasBook = false,
  isFavourite = false,
  layout = 'grid',
  onPress,
  onToggleFavourite,
  favouriteLabel = 'Favorilere ekle',
  style,
  testID,
}: StoryCardProps) {
  const theme = useTheme();
  const isRow = layout === 'row';

  const cover = (
    <View
      style={[
        isRow ? styles.rowCover : styles.gridCover,
        { borderRadius: theme.radius.md, backgroundColor: theme.colors.muted },
      ]}
    >
      {coverImageUrl ? (
        <Image
          source={{ uri: coverImageUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={[...theme.gradients.systemVoice.colors]}
          start={theme.gradients.systemVoice.start}
          end={theme.gradients.systemVoice.end}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]}
        />
      )}

      {statusLabel ? (
        <View style={styles.statusOverlay}>
          <Badge label={statusLabel} tone="primary" />
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[title, meta].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        isRow ? styles.row : styles.grid,
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
        },
        theme.shadows.card,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {cover}

      <View style={isRow ? styles.rowBody : styles.gridBody}>
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}

        <View style={styles.markers}>
          {hasAudio ? <Icon name="volume" size={14} color={theme.colors.mutedForeground} /> : null}
          {hasBook ? <Icon name="book" size={14} color={theme.colors.mutedForeground} /> : null}
        </View>
      </View>

      {onToggleFavourite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favouriteLabel}
          accessibilityState={{ selected: isFavourite }}
          hitSlop={10}
          onPress={onToggleFavourite}
          style={styles.favourite}
        >
          <Icon
            name="heart"
            size={18}
            color={isFavourite ? theme.colors.accent : theme.colors.mutedForeground}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1 },
  gridCover: { aspectRatio: 1, marginBottom: 10, overflow: 'hidden' },
  gridBody: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCover: { width: 64, height: 64, overflow: 'hidden' },
  rowBody: { flex: 1, gap: 2 },
  meta: { marginTop: 2 },
  markers: { flexDirection: 'row', gap: 8, marginTop: 6, minHeight: 14 },
  statusOverlay: { position: 'absolute', top: 8, left: 8 },
  favourite: { position: 'absolute', top: 10, right: 10, padding: 4 },
  pressed: { opacity: 0.92 },
});
