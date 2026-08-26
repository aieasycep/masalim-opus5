import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { SCREEN_PADDING } from '../tokens';

export interface ScreenProps {
  children: React.ReactNode;
  /** Scrolling is the default; set false for screens that own their own list. */
  scroll?: boolean | undefined;
  /** Removes the horizontal gutter, for edge-to-edge lists and readers. */
  edgeToEdge?: boolean | undefined;
  /** Space reserved at the bottom for a fixed footer or the tab bar. */
  footerHeight?: number | undefined;
  background?: string | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
  /** Pull-to-refresh, when the screen has something to refresh. */
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'] | undefined;
}

/**
 * The frame every screen sits in.
 *
 * Safe-area insets are applied here rather than per screen, and the keyboard
 * avoider is always present: a form whose submit button hides under the keyboard
 * is the single most common way a mobile screen becomes unusable, and it is not
 * something to remember to add.
 */
export function Screen({
  children,
  scroll = true,
  edgeToEdge = false,
  footerHeight = 0,
  background,
  contentStyle,
  style,
  testID,
  refreshControl,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : SCREEN_PADDING,
    paddingTop: insets.top,
    paddingBottom: insets.bottom + footerHeight,
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padding, styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...(refreshControl ? { refreshControl } : {})}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: background ?? theme.colors.background }, style]}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
