import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Button,
  Card,
  ErrorState,
  Icon,
  Input,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useBook, useUpdateBookPage } from '../../../src/hooks/queries';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { useI18n } from '../../../src/i18n';
import { SaveIndicator, type SaveState } from '../../../src/components/SaveIndicator';

/**
 * The page-by-page editor.
 *
 * Every keystroke is autosaved on a debounce and there is no save button,
 * because a button here would be a second, optional way to do something the
 * screen already does — and the version a parent forgets to press is the one
 * that loses their work. What replaces it is an honest indicator: saving, saved,
 * or failed, never a permanent tick.
 *
 * The book's pages are materialised copies of the story's, so editing here
 * never touches the story a narration was made from.
 */
export default function BookBuilderScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: book, isPending, isError, error, refetch } = useBook(id ?? null);
  const updatePage = useUpdateBookPage();

  const [texts, setTexts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!book || editing !== null) return;
    setTexts(Object.fromEntries(book.pages.map((page) => [page.id, page.text])));
  }, [book, editing]);

  const debouncedTexts = useDebouncedValue(texts, 900);

  useEffect(() => {
    if (editing === null) return;

    const text = debouncedTexts[editing];
    if (text === undefined) return;

    setSaveState('saving');
    updatePage.mutate(
      { pageId: editing, input: { text } },
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
    // Driven by the debounced text; the mutation identity would re-enter forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTexts, editing]);

  if (isPending) {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  if (isError || !book) {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <ErrorState
          title={errorCopy(error).title}
          description={errorCopy(error).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen footerHeight={110}>
      <ScreenHeader
        title={t('book.builderTitle', { name: book.title })}
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

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('book.pages')}
      </Text>

      {book.pages.map((page) => (
        <Card key={page.id} style={styles.page}>
          <View style={styles.pageHeader}>
            <Text variant="caption" tone="muted">
              {t('story.pageOf', { current: page.pageNumber, total: book.pages.length })}
            </Text>
          </View>

          {page.imageUrl ? (
            <Image
              source={{ uri: page.imageUrl }}
              style={[styles.image, { borderRadius: theme.radius.md }]}
              contentFit="cover"
            />
          ) : (
            // An unillustrated page is why the book is not print-ready yet.
            <View
              style={[
                styles.image,
                styles.placeholder,
                { backgroundColor: theme.colors.muted, borderRadius: theme.radius.md },
              ]}
            >
              <Icon name="image" size={22} color={theme.colors.mutedForeground} />
            </View>
          )}

          <Input
            label={t('book.editText')}
            value={texts[page.id] ?? ''}
            onChangeText={(value) => {
              setEditing(page.id);
              setTexts((current) => ({ ...current, [page.id]: value }));
            }}
            multiline
            numberOfLines={4}
            maxLength={2000}
          />
        </Card>
      ))}

      <Button
        label={t('book.coverTitle')}
        style={styles.cta}
        onPress={() => {
          router.push({ pathname: '/book/[id]/cover', params: { id: book.id } });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: 12, marginBottom: 10 },
  page: { gap: 12, marginBottom: 14 },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  image: { width: '100%', aspectRatio: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: 16 },
});
