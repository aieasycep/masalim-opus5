import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Input, OptionCard, Screen, ScreenHeader, Text } from '@masalim/ui';
import type { VoiceOwnerType } from '@masalim/types';
import { OWNER_NAME_KEYS, useVoiceEnrolment } from '../../src/stores/voice-enrolment';
import { useI18n } from '../../src/i18n';

const OWNERS: ReadonlyArray<{ value: VoiceOwnerType; labelKey: string; emoji: string }> = [
  { value: 'MOTHER', labelKey: 'voice.ownerMother', emoji: '👩' },
  { value: 'FATHER', labelKey: 'voice.ownerFather', emoji: '👨' },
  { value: 'GRANDMOTHER', labelKey: 'voice.ownerGrandmother', emoji: '👵' },
  { value: 'GRANDFATHER', labelKey: 'voice.ownerGrandfather', emoji: '👴' },
  { value: 'OTHER', labelKey: 'voice.ownerOther', emoji: '🧑' },
];

/**
 * Whose voice this is, and what to call it.
 *
 * Picking an owner fills the name in — a parent who taps "Anne" gets "Annemin
 * Sesi" and can move on without touching the keyboard. Typing over it stops the
 * name following later taps, because a name someone chose should not be
 * overwritten by a change of mind about the category.
 */
export default function VoiceOwnerScreen() {
  const router = useRouter();
  const { t } = useI18n();

  const draft = useVoiceEnrolment((state) => state.draft);
  const update = useVoiceEnrolment((state) => state.update);
  const [nameTouched, setNameTouched] = useState(false);

  const choose = (ownerType: VoiceOwnerType): void => {
    update({
      ownerType,
      ...(nameTouched ? {} : { displayName: t(OWNER_NAME_KEYS[ownerType]) }),
    });
  };

  const canContinue = draft.ownerType !== null && draft.displayName.trim().length > 0;

  return (
    <Screen footerHeight={110}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h4" style={styles.title}>
        {t('voice.ownerTitle')}
      </Text>

      {OWNERS.map((owner) => (
        <OptionCard
          key={owner.value}
          title={t(owner.labelKey)}
          emoji={owner.emoji}
          selected={draft.ownerType === owner.value}
          style={styles.option}
          onPress={() => {
            choose(owner.value);
          }}
        />
      ))}

      <Input
        label={t('voice.ownerNameLabel')}
        value={draft.displayName}
        onChangeText={(value) => {
          setNameTouched(true);
          update({ displayName: value });
        }}
        maxLength={40}
        showCounter
        containerStyle={styles.name}
      />

      <Button
        label={t('common.continue')}
        disabled={!canContinue}
        style={styles.cta}
        onPress={() => {
          router.push('/voice/consent');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8, marginBottom: 20 },
  option: { marginBottom: 10 },
  name: { marginTop: 16 },
  cta: { marginTop: 24 },
});
