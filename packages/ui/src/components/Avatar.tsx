import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type AvatarKind = 'child' | 'parentVoice' | 'systemVoice' | 'user';

export interface AvatarProps {
  size?: number | undefined;
  /** A child's or narrator's name; its first letter is the fallback. */
  name?: string | undefined;
  imageUrl?: string | null | undefined;
  kind?: AvatarKind | undefined;
  icon?: IconName | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A round identity mark.
 *
 * Falls back to an initial on a gradient rather than a generic silhouette: a
 * family with three children needs to tell them apart at a glance in the
 * wizard's child picker, and three identical grey heads do not help.
 *
 * The gradient is chosen by kind, which is also how a parent's cloned voice is
 * distinguished from a system narrator — warm peach against cool lavender.
 */
export function Avatar({ size = 48, name, imageUrl, kind = 'child', icon, style }: AvatarProps) {
  const theme = useTheme();

  const gradients = {
    child: theme.gradients.childAvatar,
    parentVoice: theme.gradients.parentVoice,
    systemVoice: theme.gradients.systemVoice,
    user: theme.gradients.childAvatar,
  } as const;

  const gradient = gradients[kind];
  const initial = name?.trim().charAt(0).toLocaleUpperCase('tr-TR') ?? '';

  const frame = { width: size, height: size, borderRadius: size / 2 } as const;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[frame, style as StyleProp<ImageStyle>]}
        accessibilityIgnoresInvertColors
        {...(name ? { accessibilityLabel: name } : {})}
      />
    );
  }

  return (
    <View style={[frame, styles.container, style]}>
      <LinearGradient
        colors={[...gradient.colors]}
        start={gradient.start}
        end={gradient.end}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      {icon ? (
        <Icon name={icon} size={Math.round(size * 0.42)} color={theme.colors.primaryForeground} />
      ) : (
        <Text
          variant={size >= 56 ? 'h4' : 'title'}
          tone="inverse"
          {...(name ? { accessibilityLabel: name } : {})}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
