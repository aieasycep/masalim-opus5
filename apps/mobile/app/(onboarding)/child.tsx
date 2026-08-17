import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AGE_RANGES, ANALYTICS_EVENTS, type AgeRange } from '@masalim/types';
import {
  Button,
  Chip,
  ChipGroup,
  Input,
  OptionCard,
  Screen,
  ScreenHeader,
  Text,
} from '@masalim/ui';
import { AGE_BAND_RULES } from '@masalim/types';
import { useCreateChild, useInterests } from '../../src/hooks/queries';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { analytics } from '../../src/lib/analytics';
import { api } from '../../src/lib/api';

const MAX_INTERESTS = 8;
const MAX_CUSTOM_INTERESTS = 5;

/**
 * The first child profile.
 *
 * Reached straight after sign-up because every other screen assumes a child
 * exists — the wizard personalises on their name and age, and Home greets them.
 * Interests are optional and can be added later; the name and an age band are
 * the two things a story genuinely cannot be written without.
 */
export default function ChildProfileScreen() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const { data: interests = [] } = useInterests();
  const createChild = useCreateChild();
  const setUser = useSession((state) => state.setUser);
  const selectChild = useSession((state) => state.selectChild);

  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && ageRange !== null;

  const ageOptions = useMemo(
    () =>
      AGE_RANGES.map((range) => ({
        value: range,
        label: AGE_BAND_RULES[range].label,
      })),
    [],
  );

  const toggleInterest = (slug: string): void => {
    setSelectedSlugs((current) =>
      current.includes(slug)
        ? current.filter((candidate) => candidate !== slug)
        : current.length >= MAX_INTERESTS
          ? current
          : [...current, slug],
    );
  };

  const addCustomInterest = (): void => {
    const value = customInterest.trim();
    if (value.length === 0 || customInterests.length >= MAX_CUSTOM_INTERESTS) return;
    setCustomInterests((current) => [...current, value]);
    setCustomInterest('');
  };

  const submit = (): void => {
    if (!canSubmit || ageRange === null) return;
    setError(null);

    createChild.mutate(
      {
        name: name.trim(),
        ageRange,
        interestSlugs: selectedSlugs,
        customInterests,
        preferences: {},
      },
      {
        onSuccess: async (child) => {
          selectChild(child.id);
          analytics.capture(ANALYTICS_EVENTS.CHILD_CREATED, {
            age_band: child.ageRange,
            // 'birth' is a redacted key fragment, so the mode is reported as a
            // source enum rather than a has_birth_date boolean.
            age_source: 'band',
            interest_count: selectedSlugs.length,
            custom_interest_count: customInterests.length,
            during_onboarding: true,
          });
          // Marking onboarding complete is what lets the gate stop redirecting
          // back here on every launch.
          const user = await api.users.completeOnboarding().catch(() => null);
          if (user) {
            setUser(user);
            // Only on the server confirming it: a failed call leaves the parent
            // still in onboarding whatever the router does next.
            analytics.capture(ANALYTICS_EVENTS.ONBOARDING_COMPLETED);
          }
          router.replace('/(tabs)');
        },
        onError: (cause: unknown) => {
          setError(errorCopy(cause).message);
        },
      },
    );
  };

  return (
    <Screen footerHeight={96}>
      <ScreenHeader title={t('child.createTitle')} subtitle={t('child.createSubtitle')} />

      <View style={styles.section}>
        <Input
          label={t('child.name')}
          placeholder={t('child.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={40}
        />
      </View>

      <View style={styles.section}>
        <Text variant="h6" style={styles.sectionTitle}>
          {t('child.ageRange')}
        </Text>
        <View style={styles.ages}>
          {ageOptions.map((option) => (
            <OptionCard
              key={option.value}
              title={t('common.yearsOld', { count: option.label })}
              selected={ageRange === option.value}
              onPress={() => {
                setAgeRange(option.value);
              }}
            />
          ))}
        </View>
      </View>

      {name.trim().length > 0 ? (
        <View style={styles.section}>
          <Text variant="h6" style={styles.sectionTitle}>
            {t('child.interestsTitle', { name: name.trim() })}
          </Text>
          <Text variant="small" tone="muted" style={styles.sectionBody}>
            {t('child.interestsSubtitle')}
          </Text>

          <ChipGroup style={styles.chips}>
            {interests.map((interest) => (
              <Chip
                key={interest.id}
                label={t(interest.labelKey)}
                emoji={interest.emoji}
                selected={selectedSlugs.includes(interest.slug)}
                onPress={() => {
                  toggleInterest(interest.slug);
                }}
              />
            ))}
            {customInterests.map((value) => (
              <Chip
                key={value}
                label={value}
                selected
                onPress={() => {
                  setCustomInterests((current) =>
                    current.filter((candidate) => candidate !== value),
                  );
                }}
              />
            ))}
          </ChipGroup>

          <View style={styles.customRow}>
            <Input
              placeholder={t('child.customInterestPlaceholder')}
              value={customInterest}
              onChangeText={setCustomInterest}
              onSubmitEditing={addCustomInterest}
              returnKeyType="done"
              maxLength={30}
              containerStyle={styles.customInput}
            />
            <Button
              label={t('child.addCustomInterest')}
              variant="secondary"
              size="medium"
              fullWidth={false}
              disabled={customInterest.trim().length === 0}
              onPress={addCustomInterest}
            />
          </View>
        </View>
      ) : null}

      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        label={t('child.addChild')}
        disabled={!canSubmit}
        loading={createChild.isPending}
        onPress={submit}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 8 },
  sectionBody: { marginBottom: 12 },
  ages: { gap: 10 },
  chips: { marginTop: 4 },
  customRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  customInput: { flex: 1 },
  submit: { marginTop: 32 },
});
