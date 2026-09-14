import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AGE_BAND_RULES, AGE_RANGES, ANALYTICS_EVENTS, type AgeRange } from '@masalim/types';
import { updateChildSchema } from '@masalim/validation';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  ConfirmDialog,
  ErrorState,
  Input,
  ListItem,
  LoadingState,
  OptionCard,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  useToast,
} from '@masalim/ui';
import {
  useChild,
  useChildren,
  useDeleteChild,
  useInterests,
  useUpdateChild,
} from '../../src/hooks/queries';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { analytics } from '../../src/lib/analytics';
import {
  CHILD_LIMITS,
  formatDateInput,
  fromIsoDate,
  toIsoDate,
  type AgeMode,
} from '../../src/lib/child-form';

/**
 * An existing child's profile.
 *
 * Editing is explicit rather than autosaved: unlike a story draft, every field
 * here changes how future stories are written, and a half-typed name saving
 * itself is not a change a parent asked for.
 *
 * Deleting says what it actually costs. The profile stops being available for
 * new stories; the ones already told stay in the library, because the server
 * soft-deletes the child and leaves the stories alone.
 */
export default function ChildProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: child, isPending, isError, error: loadError, refetch } = useChild(id ?? null);
  const { data: children = [] } = useChildren();
  const { data: interests = [] } = useInterests();
  const updateChild = useUpdateChild();
  const deleteChild = useDeleteChild();
  const selectedChildId = useSession((state) => state.selectedChildId);
  const selectChild = useSession((state) => state.selectChild);

  const [name, setName] = useState('');
  const [ageMode, setAgeMode] = useState<AgeMode>('ageRange');
  const [birthDate, setBirthDate] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Seeded once the profile arrives; anything typed afterwards is the parent's,
  // and a background refetch must not overwrite it.
  useEffect(() => {
    if (!child || dirty) return;
    setName(child.name);
    setAgeMode(child.birthDate ? 'birthDate' : 'ageRange');
    setBirthDate(child.birthDate ? fromIsoDate(child.birthDate) : '');
    setAgeRange(child.ageRange);
    setSelectedSlugs(child.interests.map((interest) => interest.slug));
    setCustomInterests(child.customInterests);
  }, [child, dirty]);

  const ageOptions = useMemo(
    () => AGE_RANGES.map((range) => ({ value: range, label: AGE_BAND_RULES[range].label })),
    [],
  );

  const trimmedName = name.trim();
  const hasAge = ageMode === 'birthDate' ? toIsoDate(birthDate) !== null : ageRange !== null;
  const atInterestCap = selectedSlugs.length >= CHILD_LIMITS.interests;
  const atCustomCap = customInterests.length >= CHILD_LIMITS.customInterests;

  const toggleInterest = (slug: string): void => {
    setDirty(true);
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
    setDirty(true);
    setCustomInterests((current) => (current.includes(value) ? current : [...current, value]));
    setCustomInterest('');
  };

  const save = (): void => {
    if (!id) return;

    // Switching to a band sends an explicit null rather than simply omitting the
    // date. Omitting it would leave the stored date in place, and the server
    // prefers a date over a band when deriving the age — so the parent's choice
    // would be quietly undone on the very next save.
    const parsed = updateChildSchema.safeParse({
      name,
      ...(ageMode === 'birthDate'
        ? { birthDate: toIsoDate(birthDate) ?? birthDate }
        : { birthDate: null }),
      ...(ageMode === 'ageRange' && ageRange ? { ageRange } : {}),
      interestSlugs: selectedSlugs,
      customInterests,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? t(`validation.${issue.message}`) : errorCopy(parsed.error).message);
      return;
    }

    setFormError(null);
    updateChild.mutate(
      { id, input: parsed.data },
      {
        onSuccess: (updated) => {
          analytics.capture(ANALYTICS_EVENTS.CHILD_UPDATED, {
            age_band: updated.ageRange,
            // 'birth' is a redacted key fragment, so the mode is reported as a
            // source enum rather than a has_birth_date boolean.
            age_source: ageMode === 'birthDate' ? 'date' : 'band',
            interest_count: selectedSlugs.length,
            custom_interest_count: customInterests.length,
          });
          setDirty(false);
          toast.show({ message: t('child.saved'), tone: 'success' });
        },
        onError: (cause: unknown) => {
          setFormError(errorCopy(cause).message);
        },
      },
    );
  };

  const remove = (): void => {
    if (!id) return;

    deleteChild.mutate(id, {
      onSuccess: () => {
        setConfirmingDelete(false);
        // Whatever the app was acting on behalf of is gone; the next sibling
        // takes over rather than leaving Home pointing at a deleted profile.
        if (selectedChildId === id) {
          const remaining = children.filter((candidate) => candidate.id !== id);
          selectChild(remaining[0]?.id ?? null);
        }
        toast.show({ message: t('child.deleted'), tone: 'success' });
        router.back();
      },
      onError: (cause: unknown) => {
        setConfirmingDelete(false);
        toast.show({ message: errorCopy(cause).message, tone: 'error' });
      },
    });
  };

  if (isPending || isError || !child) {
    return (
      <Screen>
        <ScreenHeader
          title={t('child.editChild')}
          onBack={() => {
            router.back();
          }}
        />
        {isPending ? (
          <LoadingState label={t('common.loading')} />
        ) : (
          <ErrorState
            title={errorCopy(loadError).title}
            description={errorCopy(loadError).message}
            retryLabel={t('common.retry')}
            onRetry={() => {
              void refetch();
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen footerHeight={96}>
      <ScreenHeader
        title={t('child.editChild')}
        subtitle={t('common.storyCount', { count: child.storyCount })}
        onBack={() => {
          router.back();
        }}
      />

      <View style={styles.section}>
        <Input
          label={t('child.name')}
          placeholder={t('child.namePlaceholder')}
          value={name}
          onChangeText={(value) => {
            setDirty(true);
            setName(value);
          }}
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
          onChange={(next) => {
            setDirty(true);
            setAgeMode(next);
          }}
          accessibilityLabel={t('child.ageQuestion')}
        />

        {ageMode === 'birthDate' ? (
          <Input
            label={t('child.birthDate')}
            placeholder={t('child.birthDatePlaceholder')}
            hint={t('child.birthDateHint')}
            value={birthDate}
            onChangeText={(value) => {
              setDirty(true);
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
                  setDirty(true);
                  setAgeRange(option.value);
                }}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="h6" style={styles.sectionTitle}>
          {t('child.interestsTitle', { name: trimmedName.length > 0 ? trimmedName : child.name })}
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
                setDirty(true);
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

      {formError ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}

      <Button
        label={t('common.save')}
        disabled={!dirty || trimmedName.length === 0 || !hasAge}
        loading={updateChild.isPending}
        onPress={save}
        style={styles.save}
      />

      <Card padding={0} style={styles.dangerZone}>
        <ListItem
          title={t('child.deleteChild')}
          subtitle={t('child.deleteConfirmBody')}
          icon="trash"
          tone="destructive"
          showChevron={false}
          onPress={() => {
            setConfirmingDelete(true);
          }}
        />
      </Card>

      <ConfirmDialog
        visible={confirmingDelete}
        title={t('child.deleteConfirmTitle', { name: child.name })}
        message={t('child.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        tone="destructive"
        loading={deleteChild.isPending}
        onConfirm={remove}
        onCancel={() => {
          setConfirmingDelete(false);
        }}
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
  save: { marginTop: 32 },
  dangerZone: { marginTop: 32, overflow: 'hidden' },
});
