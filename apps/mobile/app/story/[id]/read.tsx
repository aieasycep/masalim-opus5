import { useRef, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { useNarrations, useStory } from '../../../src/hooks/queries';
import { useI18n } from '../../../src/i18n';

/**
 * The storybook reader.
 *
 * Horizontal, one page at a time, because that is how a picture book works and
 * because a child watching over a shoulder understands the gesture. The text is
 * always present — reading aloud is the point, and audio is the alternative
 * rather than the requirement (§54).
 */
export default function StoryReaderScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: story, isPending, isError, refetch } = useStory(id ?? null);
  const { data: narrations = [] } = useNarrations(id ?? null);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  if (isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  if (isError || !story) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title={errorCopy(null).title}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </Screen>
    );
  }

  const readyNarration = narrations.find((narration) => narration.status === 'READY');

  return (
    <Screen scroll={false} edgeToEdge>
      <View style={styles.header}>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
          backLabel={t('common.back')}
          align="center"
          title={t('story.pageOf', {
            current: page + 1,
            total: story.pages.length,
          })}
          action={
            readyNarration ? (
              <IconButton
                name="play"
                accessibilityLabel={t('story.readAloud')}
                onPress={() => {
                  router.push({
                    pathname: '/player/[narrationId]',
                    params: { narrationId: readyNarration.id },
                  });
                }}
              />
            ) : null
          }
        />
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setPage(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
      >
        {story.pages.map((storyPage) => (
          <View key={storyPage.id} style={styles.page}>
            {storyPage.illustrationUrl ? (
              <Image
                source={{ uri: storyPage.illustrationUrl }}
                style={[styles.illustration, { borderRadius: theme.radius.lg }]}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                style={[
                  styles.illustration,
                  { borderRadius: theme.radius.lg, backgroundColor: theme.colors.secondary },
                ]}
              >
                <Icon name="image" size={28} color={theme.colors.primary} />
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.textScroll}>
              <Text variant="bodyStory">{storyPage.text}</Text>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24 },
  page: { width, paddingHorizontal: 24, paddingBottom: 24 },
  illustration: {
    width: '100%',
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  textScroll: { flex: 1 },
});
