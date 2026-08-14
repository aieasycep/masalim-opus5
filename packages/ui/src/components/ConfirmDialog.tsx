import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string | undefined;
  confirmLabel: string;
  cancelLabel: string;
  /** `destructive` for deletions, which is most of what this is used for. */
  tone?: 'default' | 'destructive' | undefined;
  loading?: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking yes/no.
 *
 * Cancel is placed second and styled as the quiet option, but it is what the
 * backdrop and the hardware back button both resolve to — the accidental
 * outcome of dismissing a dialog should never be the destructive one.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          accessibilityViewIsModal
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              padding: theme.spacing.xl,
            },
            theme.shadows.sheet,
          ]}
        >
          <Text variant="h6" align="center" accessibilityRole="header">
            {title}
          </Text>
          {message ? (
            <Text variant="body" tone="muted" align="center" style={styles.message}>
              {message}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              size="medium"
              loading={loading}
              onPress={onConfirm}
            />
            <Button
              label={cancelLabel}
              variant="tertiary"
              size="medium"
              disabled={loading}
              onPress={onCancel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 340 },
  message: { marginTop: 8 },
  actions: { marginTop: 24, gap: 10 },
});
