import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Button,
  Card,
  Icon,
  Input,
  LoadingState,
  Screen,
  ScreenHeader,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useBook, useUpdateBook } from '../../../src/hooks/queries';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { useI18n } from '../../../src/i18n';
import { SaveIndicator, type SaveState } from '../../../src/components/SaveIndicator';

interface CoverFields {
  title: string;
  subtitle: string;
  dedication: string;
  backCoverText: string;
}

/**
 * The cover and the dedication.
 *
 * The dedication is the reason this screen exists separately from the builder —
 * it is the part a parent writes for their child rather than for the story, and
 * burying it among twelve page editors would lose it. Same autosave discipline
 * as the builder, and the same honest indicator.
 */
export default function BookCoverScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: book, isPending } = useBook(id ?? null);
  const updateBook = useUpdateBook();

  const [fields, setFields] = useState<CoverFields>({
    title: '',
    subtitle: '',
    dedication: '',
    backCoverText: '',
  });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!book || dirty) return;
    setFields({
      title: book.title,
      subtitle: book.subtitle ?? '',
      dedication: book.dedication ?? '',
      backCoverText: book.backCoverText ?? '',
    });
  }, [book, dirty]);

  const debounced = useDebouncedValue(fields, 900);

  useEffect(() => {
    if (!id || !dirty || debounced.title.trim().length === 0) return;

    setSaveState('saving');
    updateBook.mutate(
      {
        id,
        input: {
          title: debounced.title.trim(),
          // An emptied field is a deliberate "remove this", and the schema takes
          // an empty string for it — omitting the key would mean "leave as is".
          subtitle: debounced.subtitle.trim(),
          dedication: debounced.dedication.trim(),
          backCoverText: debounced.backCoverText.trim(),
        },
      },
      {
        onSuccess: () => {
          setSaveState('saved');
        },
        onError: (cause) => {
          setSaveState('failed');
          toast.show({ message: errorCopy(cause).message, tone: 'error' });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, id]);

  if (isPending || !book) {
    return (
      <Screen>
        <ScreenHeader
          title={t('book.coverTitle')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  const set = (key: keyof CoverFields) => (value: string) => {
    setDirty(true);
    setFields((current) => ({ ...current, [key]: value }));
  };

  return (
    <Screen footerHeight={110}>
      <ScreenHeader
        title={t('book.coverTitle')}
        onBack={() => {
          router.back();
        }}
        action={
          <SaveIndicator
            state={saveState}
            savingLabel={t('book.saving')}
            savedLabel={t('book.saved')}
            failedLabel={t('story.editSaveFailed')}
          />
        }
      />

      <Card style={styles.preview} padding={0}>
        {book.coverImageUrl ? (
          <Image
            source={{ uri: book.coverImageUrl }}
            style={[styles.cover, { borderRadius: theme.radius.lg }]}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.cover,
              styles.placeholder,
              { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg },
            ]}
          >
            <Icon name="book" size={28} color={theme.colors.mutedForeground} />
          </View>
        )}
      </Card>

      <View style={styles.form}>
        <Input
          label={t('book.coverBookTitle')}
          value={fields.title}
          onChangeText={set('title')}
          maxLength={120}
          showCounter
        />
        <Input
          label={t('book.coverSubtitle')}
          value={fields.subtitle}
          onChangeText={set('subtitle')}
          maxLength={120}
        />
        <Input
          label={t('book.dedication')}
          placeholder={t('book.dedicationPlaceholder')}
          value={fields.dedication}
          onChangeText={set('dedication')}
          multiline
          numberOfLines={3}
          maxLength={280}
        />
        <Input
          label={t('book.backCover')}
          value={fields.backCoverText}
          onChangeText={set('backCoverText')}
          multiline
          numberOfLines={3}
          maxLength={600}
        />
      </View>

      <Button
        label={t('book.preview')}
        style={styles.cta}
        onPress={() => {
          router.push({ pathname: '/book/[id]/preview', params: { id: book.id } });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: 'center', marginTop: 12, overflow: 'hidden' },
  cover: { width: 160, height: 160 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  form: { gap: 14, marginTop: 24 },
  cta: { marginTop: 24 },
});
