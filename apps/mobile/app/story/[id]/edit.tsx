import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Card,
  Icon,
  Input,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useStory, useUpdateStory } from '../../../src/hooks/queries';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { useI18n } from '../../../src/i18n';
import { SaveIndicator, type SaveState } from '../../../src/components/SaveIndicator';

/**
 * Editing a generated story.
 *
 * Autosaved on a debounce, with the save state shown honestly — a permanent
 * "Kaydedildi" that is really "we tried once" is the kind of lie that loses a
 * parent's rewrite of the ending.
 *
 * Editing bumps the story's version on the server. Narrations already made and
 * orders already placed are untouched, because both took a snapshot of the text
 * they were built from. The notice says that plainly rather than warning
 * vaguely, since the parent's real question is whether fixing a typo will cost
 * them the recording of their own voice (§80).
 */
export default function EditStoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: story, isPending } = useStory(id ?? null);
  const updateStory = useUpdateStory();

  const [title, setTitle] = useState('');
  const [pages, setPages] = useState<Array<{ id: string; text: string }>>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Seeded once the story arrives; typing afterwards is the parent's, not a refetch's.
  useEffect(() => {
    if (!story || dirty) return;
    setTitle(story.title);
    setPages(story.pages.map((page) => ({ id: page.id, text: page.text })));
  }, [dirty, story]);

  const debouncedTitle = useDebouncedValue(title, 900);
  const debouncedPages = useDebouncedValue(pages, 900);

  useEffect(() => {
    if (!id || !dirty || debouncedTitle.trim().length === 0) return;

    setSaveState('saving');
    updateStory.mutate(
      { id, input: { title: debouncedTitle.trim(), pages: debouncedPages } },
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
    // Firing on the debounced values is the point; including the mutation would
    // re-enter on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedPages, id]);

  if (isPending || !story) {
    return (
      <Screen>
        <ScreenHeader
          title={t('story.edit')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t('story.edit')}
        onBack={() => {
          router.back();
        }}
      />

      {/* Says what an edit costs, which is nothing already made. */}
      <Card style={styles.notice}>
        <Icon name="info" size={18} color={theme.colors.mutedForeground} />
        <Text variant="small" tone="muted" style={styles.noticeText}>
          {t('story.editNotice')}
        </Text>
      </Card>

      <SaveIndicator
        state={saveState}
        savingLabel={t('story.editSaving')}
        savedLabel={t('story.editSaved')}
        failedLabel={t('story.editSaveFailed')}
        style={styles.saveRow}
      />

      <Input
        label={t('story.editTitleLabel')}
        value={title}
        onChangeText={(value) => {
          setDirty(true);
          setTitle(value);
        }}
        maxLength={120}
        showCounter
        containerStyle={styles.title}
      />

      {pages.map((page, index) => (
        <Input
          key={page.id}
          label={t('story.pageOf', { current: index + 1, total: pages.length })}
          value={page.text}
          onChangeText={(value) => {
            setDirty(true);
            setPages((current) =>
              current.map((candidate) =>
                candidate.id === page.id ? { ...candidate, text: value } : candidate,
              ),
            );
          }}
          multiline
          numberOfLines={5}
          maxLength={2000}
          containerStyle={styles.page}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12 },
  noticeText: { flex: 1 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  title: { marginTop: 12 },
  page: { marginTop: 16 },
});
