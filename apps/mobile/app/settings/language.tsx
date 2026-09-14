import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { OptionCard, Screen, ScreenHeader, useToast } from '@masalim/ui';
import { LOCALES, type Locale } from '@masalim/types';
import { useUpdateProfile } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';

const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  tr: 'Türkçe',
  en: 'English',
};

/**
 * The app's language.
 *
 * Written in its own language rather than translated — someone who has landed in
 * the wrong locale needs to recognise the one they want, and "Turkish" is no
 * help to a reader who cannot read the current interface.
 *
 * The change applies to the interface immediately and is also sent to the
 * server, because the server owns the language of what it generates: stories,
 * push notifications and the voice enrolment passage are all produced in the
 * account's locale, not the phone's.
 */
export default function LanguageSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, locale, setLocale, errorCopy } = useI18n();
  const updateProfile = useUpdateProfile();

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.language')}
        onBack={() => {
          router.back();
        }}
      />

      {LOCALES.map((candidate) => (
        <OptionCard
          key={candidate}
          title={LOCALE_NAMES[candidate]}
          selected={locale === candidate}
          style={styles.option}
          onPress={() => {
            setLocale(candidate);
            updateProfile.mutate(
              { locale: candidate },
              {
                onError: (cause) => {
                  // The interface has already switched; say the server did not.
                  toast.show({ message: errorCopy(cause).message, tone: 'error' });
                },
              },
            );
          }}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { marginBottom: 10, marginTop: 6 },
});
