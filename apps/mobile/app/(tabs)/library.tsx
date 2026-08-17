import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  StoryCard,
  useTheme,
} from '@masalim/ui';
import { ANALYTICS_EVENTS, type StorySummaryDto } from '@masalim/types';
import { analytics } from '../../src/lib/analytics';
import { useStories, useToggleFavourite } from '../../src/hooks/queries';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';
import { useI18n } from '../../src/i18n';
import { storyMeta } from '../../src/lib/format';

type Filter = 'all' | 'audio' | 'books' | 'favourites';

/**
 * The library.
 *
 * `FlashList` rather than a plain list: a family that has been using this for a
 * year has hundreds of stories with cover images, and a `ScrollView` would hold
 * every one of them in memory.
 *
 * Search is debounced — a request per keystroke would rate-limit a fast typer
 * and show them results for a prefix they have already moved past.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();
  const toggleFavourite = useToggleFavourite();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useMemo(
    () => ({
      filter,
      ...(debouncedSearch.trim().length > 0 ? { search: debouncedSearch.trim() } : {}),
    }),
    [filter, debouncedSearch],
  );

  const { data, isPending, isError, refetch } = useStories(query);
  const stories = data?.items ?? [];

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('library.filterAll') },
    { value: 'audio', label: t('library.filterAudio') },
    { value: 'books', label: t('library.filterBooks') },
    { value: 'favourites', label: t('library.filterFavourites') },
  ];

  return (
    <Screen scroll={false} footerHeight={90}>
      <ScreenHeader title={t('library.title')} />

      <Input
        placeholder={t('library.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        leadingIcon={<Icon name="search" size={18} color={theme.colors.mutedForeground} />}
        autoCorrect={false}
        containerStyle={styles.search}
      />

      <SegmentedControl
        options={filters}
        value={filter}
        onChange={setFilter}
        accessibilityLabel={t('library.title')}
        style={styles.filters}
      />

      {isPending ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} height={88} radiusToken="lg" />
          ))}
        </View>
      ) : isError ? (
        <ErrorState
          title={errorCopy(null).title}
          description={errorCopy(null).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : stories.length === 0 ? (
        <EmptyState
          icon={debouncedSearch.length > 0 ? 'search' : 'book'}
          title={
            debouncedSearch.length > 0
              ? t('empty.searchTitle')
              : filter === 'all'
                ? t('empty.storiesTitle')
                : t('empty.filterTitle')
          }
          description={
            debouncedSearch.length > 0 ? t('empty.searchBody') : t('empty.storiesBody')
          }
          {...(debouncedSearch.length === 0 && filter === 'all'
            ? {
                actionLabel: t('empty.storiesCta'),
                onAction: () => {
                  router.push('/create');
                },
              }
            : {})}
        />
      ) : (
        <FlashList
          data={stories}
          keyExtractor={(story: StorySummaryDto) => story.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: StorySummaryDto }) => (
            <StoryCard
              layout="row"
              title={item.title}
              meta={storyMeta(item, t)}
              coverImageUrl={item.coverImageUrl}
              hasAudio={item.durationSeconds !== null}
              hasBook={item.hasBook}
              isFavourite={item.isFavourite}
              statusLabel={item.status === 'READY' ? undefined : t('story.statusGenerating')}
              favouriteLabel={item.isFavourite ? t('story.unfavourite') : t('story.favourite')}
              onPress={() => {
                router.push({ pathname: '/story/[id]', params: { id: item.id } });
              }}
              onToggleFavourite={() => {
                const favouriting = !item.isFavourite;
                toggleFavourite.mutate(
                  { id: item.id, favourite: favouriting },
                  {
                    // On success rather than on the tap: this list is not updated
                    // optimistically, so repeated taps before the refetch lands
                    // would each read the same stale `isFavourite` and emit again.
                    onSuccess: () => {
                      if (favouriting) {
                        analytics.capture(ANALYTICS_EVENTS.STORY_FAVOURITED, { surface: 'library' });
                      }
                    },
                  },
                );
              }}
              style={styles.card}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { marginTop: 8 },
  filters: { marginTop: 4, marginBottom: 16 },
  skeletons: { gap: 12 },
  list: { paddingBottom: 24 },
  card: { marginBottom: 10 },
});
