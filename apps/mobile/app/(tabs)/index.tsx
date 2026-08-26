import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  OfflineBanner,
  ProgressBar,
  Skeleton,
  StoryCard,
  Text,
  useTheme,
} from '@masalim/ui';
import type { StorySummaryDto } from '@masalim/types';
import { useHome, useToggleFavourite } from '../../src/hooks/queries';
import { useNetworkStatus } from '../../src/hooks/use-network-status';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { storyMeta } from '../../src/lib/format';

/**
 * Home.
 *
 * One request fills the whole screen. The order is deliberate: whatever is
 * half-listened-to comes first, then the invitation to make something new, then
 * what already exists — a parent opening the app at bedtime is far more often
 * resuming than starting.
 */
export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();
  const { isOnline } = useNetworkStatus();
  const user = useSession((state) => state.user);
  const selectedChildId = useSession((state) => state.selectedChildId);
  const selectChild = useSession((state) => state.selectChild);
  const toggleFavourite = useToggleFavourite();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, isError, refetch } = useHome();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => {
      setRefreshing(false);
    });
  }, [refetch]);

  if (isPending) return <HomeSkeleton />;

  if (isError || !data) {
    return (
      <ScrollView contentContainerStyle={styles.centre}>
        <ErrorState
          title={errorCopy(null).title}
          description={errorCopy(null).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </ScrollView>
    );
  }

  const activeChild =
    data.children.find((child) => child.id === selectedChildId) ?? data.children[0] ?? null;
  const quotaUsed = data.storyLimit > 0 ? data.storiesThisMonth / data.storyLimit : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!isOnline ? <OfflineBanner message={t('offline.title')} style={styles.offline} /> : null}

      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text variant="small" tone="muted">
            {t(data.greetingKey)}
            {user?.name ? `, ${user.name}` : ''}
          </Text>
          <Text variant="h2" style={styles.question}>
            {t('home.question')}
          </Text>
        </View>
      </View>

      {data.children.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.childRow}
        >
          {data.children.map((child) => (
            <Card
              key={child.id}
              variant={child.id === activeChild?.id ? 'raised' : 'flat'}
              onPress={() => {
                selectChild(child.id);
              }}
              accessibilityLabel={child.name}
              padding={10}
              style={styles.childChip}
            >
              <Avatar name={child.name} imageUrl={child.avatarUrl} size={32} />
              <Text variant="smallBold">{child.name}</Text>
            </Card>
          ))}
        </ScrollView>
      ) : null}

      {/* The one action the app exists for. */}
      <Card padding={0} shadow="hero" style={styles.hero}>
        <LinearGradient
          colors={[...theme.gradients.hero.colors]}
          locations={[...theme.gradients.hero.locations]}
          start={theme.gradients.hero.start}
          end={theme.gradients.hero.end}
          style={styles.heroGradient}
        >
          <Text variant="eyebrow" tone="inverse">
            {t('home.heroEyebrow')}
          </Text>
          <Text variant="h3" tone="inverse" style={styles.heroTitle}>
            {activeChild
              ? t('home.heroTitle', { name: activeChild.name })
              : t('home.heroTitleGeneric')}
          </Text>
          <Button
            label={t('home.heroCta')}
            variant="secondary"
            size="medium"
            fullWidth={false}
            onPress={() => {
              router.push('/create');
            }}
            style={styles.heroCta}
          />
        </LinearGradient>
      </Card>

      {data.storyLimit < 50 ? (
        <Card variant="flat" style={styles.quota}>
          <View style={styles.quotaHeader}>
            <Text variant="smallBold">{t('subscription.usageStories')}</Text>
            <Text variant="small" tone="muted">
              {`${String(data.storiesThisMonth)} / ${String(data.storyLimit)}`}
            </Text>
          </View>
          <ProgressBar value={quotaUsed} style={styles.quotaBar} />
        </Card>
      ) : null}

      {data.continueListening ? (
        <Section title={t('home.continueTitle')}>
          <Card
            onPress={() => {
              router.push({
                pathname: '/player/[narrationId]',
                params: { narrationId: data.continueListening?.narrationId ?? '' },
              });
            }}
            accessibilityLabel={data.continueListening.story.title}
            shadow="raised"
            style={styles.continueCard}
          >
            <Text variant="title" numberOfLines={1}>
              {data.continueListening.story.title}
            </Text>
            <ProgressBar
              value={
                data.continueListening.durationSeconds
                  ? data.continueListening.positionSeconds /
                    data.continueListening.durationSeconds
                  : 0
              }
              style={styles.continueBar}
            />
            <Text variant="caption" tone="muted">
              {t('home.continueProgress', {
                percent: String(
                  Math.round(
                    data.continueListening.durationSeconds
                      ? (data.continueListening.positionSeconds /
                          data.continueListening.durationSeconds) *
                          100
                      : 0,
                  ),
                ),
              })}
            </Text>
          </Card>
        </Section>
      ) : null}

      {data.recentStories.length > 0 ? (
        <Section title={t('home.recentTitle')}>
          <View style={styles.storyList}>
            {data.recentStories.slice(0, 5).map((story) => (
              <StoryCardRow
                key={story.id}
                story={story}
                onPress={() => {
                  router.push({ pathname: '/story/[id]', params: { id: story.id } });
                }}
                onToggleFavourite={() => {
                  toggleFavourite.mutate({ id: story.id, favourite: !story.isFavourite });
                }}
              />
            ))}
          </View>
        </Section>
      ) : (
        <EmptyState
          title={t('empty.storiesTitle')}
          description={t('empty.storiesBody')}
          actionLabel={t('empty.storiesCta')}
          onAction={() => {
            router.push('/create');
          }}
        />
      )}
    </ScrollView>
  );
}

function StoryCardRow({
  story,
  onPress,
  onToggleFavourite,
}: {
  story: StorySummaryDto;
  onPress: () => void;
  onToggleFavourite: () => void;
}) {
  const { t } = useI18n();

  return (
    <StoryCard
      layout="row"
      title={story.title}
      meta={storyMeta(story, t)}
      coverImageUrl={story.coverImageUrl}
      hasAudio={story.durationSeconds !== null}
      hasBook={story.hasBook}
      isFavourite={story.isFavourite}
      statusLabel={story.status === 'READY' ? undefined : t('story.statusGenerating')}
      onPress={onPress}
      onToggleFavourite={onToggleFavourite}
      favouriteLabel={t('story.favourite')}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="h6" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.content}>
      <Skeleton width="60%" height={20} style={styles.skeletonItem} />
      <Skeleton height={150} radiusToken="lg" style={styles.skeletonItem} />
      <Skeleton width="40%" height={16} style={styles.skeletonItem} />
      <Skeleton height={88} radiusToken="lg" style={styles.skeletonItem} />
      <Skeleton height={88} radiusToken="lg" style={styles.skeletonItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 64, paddingBottom: 120, gap: 4 },
  centre: { flexGrow: 1, justifyContent: 'center' },
  offline: { marginBottom: 12 },
  header: { marginBottom: 16 },
  greeting: { gap: 6 },
  question: { marginTop: 2 },
  childRow: { gap: 8, paddingBottom: 12 },
  childChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: { overflow: 'hidden', marginTop: 8 },
  heroGradient: { padding: 20, gap: 8 },
  heroTitle: { marginBottom: 8 },
  heroCta: { alignSelf: 'flex-start' },
  quota: { marginTop: 16 },
  quotaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quotaBar: { marginTop: 10 },
  section: { marginTop: 28 },
  sectionTitle: { marginBottom: 12 },
  continueCard: { gap: 8 },
  continueBar: { marginTop: 4 },
  storyList: { gap: 10 },
  skeletonItem: { marginBottom: 12 },
});
