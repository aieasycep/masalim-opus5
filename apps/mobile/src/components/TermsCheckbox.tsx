import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Icon, Text, useTheme } from '@masalim/ui';
import { useI18n } from '../i18n';

const TERMS_URL = 'https://masalim.app/kosullar';
const PRIVACY_URL = 'https://masalim.app/gizlilik';

export interface TermsCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * Acceptance of the terms.
 *
 * The documents open in an in-app browser rather than throwing the parent out
 * to Safari mid-signup, and the checkbox itself is a separate target from the
 * links — tapping "Gizlilik Politikası" to read it should not silently tick a
 * consent box.
 */
export function TermsCheckbox({ checked, onChange, style }: TermsCheckboxProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.row, style]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t('auth.acceptTerms')}
        hitSlop={8}
        onPress={() => {
          onChange(!checked);
        }}
        style={[
          styles.box,
          {
            borderColor: checked ? theme.colors.primary : theme.colors.border,
            backgroundColor: checked ? theme.colors.primary : 'transparent',
            borderRadius: theme.radius.xs,
          },
        ]}
      >
        {checked ? <Icon name="check" size={14} color={theme.colors.primaryForeground} /> : null}
      </Pressable>

      <Text variant="small" tone="muted" style={styles.label}>
        {t('auth.acceptTerms')}{' '}
        <Text
          variant="small"
          tone="primary"
          accessibilityRole="link"
          onPress={() => {
            void WebBrowser.openBrowserAsync(TERMS_URL);
          }}
        >
          {t('settings.terms')}
        </Text>
        {' · '}
        <Text
          variant="small"
          tone="primary"
          accessibilityRole="link"
          onPress={() => {
            void WebBrowser.openBrowserAsync(PRIVACY_URL);
          }}
        >
          {t('settings.privacyPolicy')}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  label: { flex: 1 },
});
