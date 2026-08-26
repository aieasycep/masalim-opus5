import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string | undefined;
  /** Already-localised message. An input with an error is announced as invalid. */
  error?: string | null | undefined;
  hint?: string | undefined;
  /** Rendered inside the field, before the text. */
  leadingIcon?: React.ReactNode | undefined;
  /** Rendered inside the field, after the text — a reveal toggle, a clear button. */
  trailingIcon?: React.ReactNode | undefined;
  onTrailingIconPress?: (() => void) | undefined;
  /** Shows a live "24/600" counter; pairs with `maxLength`. */
  showCounter?: boolean | undefined;
  containerStyle?: StyleProp<ViewStyle> | undefined;
}

/**
 * A labelled text field.
 *
 * The error is rendered *and* announced: `accessibilityInvalid` alone tells a
 * screen reader something is wrong without saying what, which is exactly the
 * experience the message exists to avoid.
 */
export function Input({
  label,
  error,
  hint,
  leadingIcon,
  trailingIcon,
  onTrailingIconPress,
  showCounter = false,
  containerStyle,
  multiline,
  maxLength,
  value,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.destructive
    : focused
      ? theme.colors.ring
      : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="smallBold" tone="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.card,
            borderColor,
            borderRadius: theme.radius.md,
            minHeight: multiline ? 120 : MIN_TOUCH_TARGET + 8,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? theme.spacing.md : 0,
          },
        ]}
      >
        {leadingIcon ? <View style={styles.affix}>{leadingIcon}</View> : null}

        <TextInput
          value={value}
          multiline={multiline}
          maxLength={maxLength}
          placeholderTextColor={theme.colors.mutedForeground}
          selectionColor={theme.colors.primary}
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...(error ? { 'aria-invalid': true, 'aria-errormessage': error } : {})}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.text.body,
            styles.input,
            { color: theme.colors.foreground },
            multiline ? styles.multiline : null,
          ]}
          {...rest}
        />

        {trailingIcon ? (
          <Pressable
            onPress={onTrailingIconPress}
            disabled={!onTrailingIconPress}
            hitSlop={8}
            accessibilityRole={onTrailingIconPress ? 'button' : 'none'}
            style={styles.affix}
          >
            {trailingIcon}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerMessage}>
          {error ? (
            <Text variant="caption" tone="destructive">
              {error}
            </Text>
          ) : hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>

        {showCounter && maxLength ? (
          <Text variant="caption" tone="muted">
            {`${String(value?.length ?? 0)}/${String(maxLength)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  label: { marginBottom: 6 },
  field: {
    flexDirection: 'row',
    borderWidth: 1.5,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
  },
  multiline: {
    textAlignVertical: 'top',
    minHeight: 96,
  },
  affix: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    minHeight: 16,
    gap: 8,
  },
  footerMessage: { flex: 1 },
});
