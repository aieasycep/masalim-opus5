import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AGE_BAND_RULES, AGE_RANGES, ANALYTICS_EVENTS, type AgeRange } from '@masalim/types';
import { createChildSchema } from '@masalim/validation';
import {
  Button,
  Chip,
  ChipGroup,
  Input,
  OptionCard,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
} from '@masalim/ui';
import { useCreateChild, useInterests } from '../../src/hooks/queries';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { analytics } from '../../src/lib/analytics';
import {
  CHILD_LIMITS,
  formatDateInput,
  toIsoDate,
  type AgeMode,
} from '../../src/lib/child-form';

/**
 * A second — or third — child.
 *
 * The same fields as the onboarding profile, with one addition: a birth date can
 * be given instead of a band, and the server derives the band from it. That is
 * worth offering here because a family adding a sibling months later is the case
 * where a fixed band silently goes stale, and a date does not.
 */
export default function NewChildScreen() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const { data: interests = [] } = useInterests();
  const createChild = useCreateChild();
  const selectChild = useSession((state) => state.selectChild);

  const [name, setName] = useState('');
  const [ageMode, setAgeMode] = useState<AgeMode>('ageRange');
  const [birthDate, setBirthDate] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ageOptions = useMemo(
    () => AGE_RANGES.map((range) => ({ value: range, label: AGE_BAND_RULES[range].label })),
    [],
  );

  const trimmedName = name.trim();
  const hasAge = ageMode === 'birthDate' ? toIsoDate(birthDate) !== null : ageRange !== null;
  const canSubmit = trimmedName.length > 0 && hasAge;

  const atInterestCap = selectedSlugs.length >= CHILD_LIMITS.interests;
  const atCustomCap = customInterests.length >= CHILD_LIMITS.customInterests;

  const toggleInterest = (slug: string): void => {
    setSelectedSlugs((current) =>
      current.includes(slug)
        ? current.filter((candidate) => candidate !== slug)
        : current.length >= CHILD_LIMITS.interests
          ? current
          : [...current, slug],
    );
  };

  const addCustomInterest = (): void => {
    const value = customInterest.trim();
    if (value.length === 0 || customInterests.length >= CHILD_LIMITS.customInterests) return;
    setCustomInterests((current) =>
      current.includes(value) ? current : [...current, value],
    );
    setCustomInterest('');
  };

  const submit = (): void => {
    // Validated with the schema the API validates with, so nothing passes here
    // and fails there — and the codes it throws are the ones the copy is keyed on.
    const parsed = createChildSchema.safeParse({
      name,
      ...(ageMode === 'birthDate' ? { birthDate: toIsoDate(birthDate) ?? birthDate } : {}),
      ...(ageMode === 'ageRange' && ageRange ? { ageRange } : {}),
      interestSlugs: selectedSlugs,
      customInterests,
      preferences: {},
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? t(`validation.${issue.message}`) : errorCopy(parsed.error).message);
      return;
    }

    setError(null);
    createChild.mutate(parsed.data, {
      onSuccess: (child) => {
        analytics.capture(ANALYTICS_EVENTS.CHILD_CREATED, {
          // The band is reported from the saved child because in birthDate mode
          // the server is the one that derives it.
          age_band: child.ageRange,
          // 'birth' is a redacted key fragment, so the mode is reported as a
          // source enum rather than a has_birth_date boolean.
          age_source: ageMode === 'birthDate' ? 'date' : 'band',
          interest_count: selectedSlugs.length,
          custom_interest_count: customInterests.length,
          during_onboarding: false,
        });
        // The parent added this child to make something for them; acting on
        // behalf of the sibling they just left is not what they meant.
        selectChild(child.id);
        router.back();
      },
      onError: (cause: unknown) => {
        setError(errorCopy(cause).message);
      },
    });
  };

  return (
    <Screen footerHeight={96}>
      <ScreenHeader
        title={t('child.addChild')}
        subtitle={t('child.createSubtitle')}
        onBack={() => {
          router.back();
        }}
      />

      <View style={styles.section}>
        <Input
          label={t('child.name')}
          placeholder={t('child.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={CHILD_LIMITS.nameMax}
        />
      </View>

      <View style={styles.section}>
        <Text variant="h6" style={styles.sectionTitle}>
          {t('child.ageQuestion')}
        </Text>
        <SegmentedControl<AgeMode>
          options={[
            { value: 'ageRange', label: t('child.ageRange') },
            { value: 'birthDate', label: t('child.birthDate') },
          ]}
          value={ageMode}
          onChange={setAgeMode}
          accessibilityLabel={t('child.ageQuestion')}
        />

        {ageMode === 'birthDate' ? (
          <Input
            label={t('child.birthDate')}
            placeholder={t('child.birthDatePlaceholder')}
            hint={t('child.birthDateHint')}
            value={birthDate}
            onChangeText={(value) => {
              setBirthDate(formatDateInput(value));
            }}
            keyboardType="number-pad"
            maxLength={10}
            containerStyle={styles.birthDate}
          />
        ) : (
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
        )}
      </View>

      {trimmedName.length > 0 ? (
        <View style={styles.section}>
          <Text variant="h6" style={styles.sectionTitle}>
            {t('child.interestsTitle', { name: trimmedName })}
          </Text>
          <Text variant="small" tone="muted" style={styles.sectionBody}>
            {t('child.interestsSubtitle')}
          </Text>

          <ChipGroup style={styles.chips}>
            {interests.map((interest) => {
              const selected = selectedSlugs.includes(interest.slug);
              return (
                <Chip
                  key={interest.id}
                  label={t(interest.labelKey)}
                  emoji={interest.emoji}
                  selected={selected}
                  disabled={!selected && atInterestCap}
                  onPress={() => {
                    toggleInterest(interest.slug);
                  }}
                />
              );
            })}
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

          {atInterestCap && Number.isFinite(CHILD_LIMITS.interests) ? (
            <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
              {t('child.interestLimit', { count: CHILD_LIMITS.interests })}
            </Text>
          ) : null}

          <View style={styles.customRow}>
            <Input
              placeholder={t('child.customInterestPlaceholder')}
              value={customInterest}
              onChangeText={setCustomInterest}
              onSubmitEditing={addCustomInterest}
              returnKeyType="done"
              maxLength={CHILD_LIMITS.customInterestLength}
              editable={!atCustomCap}
              containerStyle={styles.customInput}
            />
            <Button
              label={t('child.addCustomInterest')}
              variant="secondary"
              size="medium"
              fullWidth={false}
              disabled={customInterest.trim().length === 0 || atCustomCap}
              onPress={addCustomInterest}
            />
          </View>

          {atCustomCap && Number.isFinite(CHILD_LIMITS.customInterests) ? (
            <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
              {t('child.customInterestLimit', { count: CHILD_LIMITS.customInterests })}
            </Text>
          ) : null}
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
  birthDate: { marginTop: 16 },
  ages: { gap: 10, marginTop: 16 },
  chips: { marginTop: 4 },
  customRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  customInput: { flex: 1 },
  submit: { marginTop: 32 },
});
