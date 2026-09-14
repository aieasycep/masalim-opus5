import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string | undefined;
  /** Label for the close control and the backdrop, for screen readers. */
  closeLabel?: string | undefined;
  /** Fixed footer, e.g. a "Kaydet" button that should not scroll away. */
  footer?: React.ReactNode | undefined;
  scroll?: boolean | undefined;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A sheet that rises from the bottom.
 *
 * Backdrop taps close it, and so does the hardware back button on Android via
 * `onRequestClose` — a sheet a parent cannot dismiss with the gesture their
 * phone taught them is a trap.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  closeLabel = 'Kapat',
  footer,
  scroll = true,
  children,
  style,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scrollContent}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: theme.radius.xxl,
              borderTopRightRadius: theme.radius.xxl,
              paddingBottom: insets.bottom + theme.spacing.base,
            },
            theme.shadows.sheet,
            style,
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.grabber, { backgroundColor: theme.colors.border }]}
          />

          {title ? (
            <View style={styles.header}>
              <Text variant="h6" accessibilityRole="header" style={styles.headerTitle}>
                {title}
              </Text>
              <IconButton
                name="close"
                accessibilityLabel={closeLabel}
                onPress={onClose}
                size={36}
              />
            </View>
          ) : null}

          {body}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  headerTitle: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  footer: { paddingTop: 12 },
});
