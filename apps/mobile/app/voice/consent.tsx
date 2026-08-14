import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Icon, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import { VOICE_CONSENT_VERSION } from '@masalim/validation';
import { useAcceptVoiceConsent } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

/**
 * Consent, recorded before a microphone is ever opened.
 *
 * The tick here is not the gate. Accepting posts to the server, which writes a
 * row with the wording version, the timestamp and a hashed IP; `POST /voices` is
 * refused outright when that row is missing. So a client that skipped this screen
 * — a modified build, a replayed request — cannot enrol a voice (§21).
 *
 * The version travels with the acceptance because the wording will change, and
 * "they agreed" is not an answer without "to what, and when".
 */
export default function VoiceConsentScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();

  const accept = useAcceptVoiceConsent();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen footerHeight={120}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h4" style={styles.title}>
        {t('voice.consentTitle')}
      </Text>
      <Text variant="body" tone="muted" style={styles.body}>
        {t('voice.consentBody')}
      </Text>

      <Card style={styles.note}>
        <Icon name="trash" size={18} color={theme.colors.mutedForeground} />
        <Text variant="small" tone="muted" style={styles.noteText}>
          {t('voice.consentDeleteNote')}
        </Text>
      </Card>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t('voice.consentCheckbox')}
        hitSlop={8}
        style={styles.checkRow}
        onPress={() => {
          setChecked((current) => !current);
          setError(null);
        }}
      >
        <View
          style={[
            styles.box,
            {
              borderRadius: theme.radius.xs,
              borderColor: checked ? theme.colors.primary : theme.colors.border,
              backgroundColor: checked ? theme.colors.primary : 'transparent',
            },
          ]}
        >
          {checked ? <Icon name="check" size={14} color={theme.colors.primaryForeground} /> : null}
        </View>

        <Text variant="small" style={styles.checkLabel}>
          {t('voice.consentCheckbox')}
        </Text>
      </Pressable>

      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        label={t('voice.consentAccept')}
        disabled={!checked}
        loading={accept.isPending}
        style={styles.cta}
        onPress={() => {
          accept.mutate(VOICE_CONSENT_VERSION, {
            onSuccess: () => {
              router.push('/voice/mic-test');
            },
            onError: (cause) => {
              setError(errorCopy(cause).message);
            },
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8 },
  body: { marginTop: 12 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 },
  noteText: { flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 28 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkLabel: { flex: 1 },
  cta: { marginTop: 28 },
});
