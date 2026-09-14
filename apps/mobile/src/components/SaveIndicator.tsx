import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Text, useTheme } from '@masalim/ui';
import type { IconName } from '@masalim/ui';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveIndicatorProps {
  state: SaveState;
  /** Already-localised, because the three screens using this name it differently. */
  savingLabel: string;
  savedLabel: string;
  failedLabel: string;
  style?: StyleProp<ViewStyle> | undefined;
}

const ICONS: Record<Exclude<SaveState, 'idle'>, IconName> = {
  saving: 'clock',
  saved: 'check',
  failed: 'alert',
};

/**
 * What happened to the last autosave.
 *
 * Every autosaving screen owes the parent this. A builder that shows a permanent
 * "Kaydedildi" the moment it loads is claiming something it has not done, and
 * the cost of that lie is a rewritten dedication that never reached the server.
 * Idle renders nothing — before the first edit there is genuinely nothing to
 * report, and a reassuring tick would be the same lie in a quieter voice.
 *
 * Announced politely so a screen reader mentions a failure without interrupting
 * whatever is being typed.
 */
export function SaveIndicator({
  state,
  savingLabel,
  savedLabel,
  failedLabel,
  style,
}: SaveIndicatorProps) {
  const theme = useTheme();

  if (state === 'idle') return null;

  const labels: Record<Exclude<SaveState, 'idle'>, string> = {
    saving: savingLabel,
    saved: savedLabel,
    failed: failedLabel,
  };

  return (
    <View style={[styles.row, style]}>
      <Icon
        name={ICONS[state]}
        size={14}
        color={state === 'failed' ? theme.colors.destructive : theme.colors.mutedForeground}
      />
      <Text
        variant="caption"
        tone={state === 'failed' ? 'destructive' : 'muted'}
        accessibilityLiveRegion="polite"
      >
        {labels[state]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
