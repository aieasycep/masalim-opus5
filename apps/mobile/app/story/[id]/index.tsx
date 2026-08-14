import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  ErrorState,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@masalim/api-client';
import { AGE_BAND_RULES } from '@masalim/types';
import { api } from '../../../src/lib/api';
import {
  useDeleteStory,
  useNarrations,
  useStory,
  useToggleFavourite,
} from '../../../src/hooks/queries';
import { useI18n } from '../../../src/i18n';
import { formatDuration } from '../../../src/lib/format';

/**
 * A finished story.
 *
 * The primary action is listening, because that is what the story is for. Adding
 * a narration in another voice, illustrating it and turning it into a book are
 * all offered from here and none of them regenerate the text — the words a
 * parent has already read to their child stay exactly as they are.
 */
export default function StoryDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: story, isPending, isError, refetch } = useStory(id ?? null);
  const { data: narrations = [] } = useNarrations(id ?? null);
  const toggleFavourite = useToggleFavourite();
  const deleteStory = useDeleteStory();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const illustrate = useMutation({
    mutationFn: () =>
      api.illustrations.create(id ?? '', {
        style: 'watercolor',
        idempotencyKey: Crypto.randomUUID(),
      }),
    onSuccess: ({ job }) => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.illustrations(id ?? '') });
      router.push({ pathname: '/generating/[jobId]', params: { jobId: job.id, storyId: id } });
    },
    onError: (cause: unknown) => {
      toast.show({ message: errorCopy(cause).message, tone: 'error' });
    },
  });

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
          description={errorCopy(null).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </Screen>
    );
  }

  const readyNarration = narrations.find((narration) => narration.status === 'READY');
  const excerpt = story.pages[0]?.text ?? '';

  return (
    <Screen footerHeight={24}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
        backLabel={t('common.back')}
        action={
          <IconButton
            name="heart"
            accessibilityLabel={story.isFavourite ? t('story.unfavourite') : t('story.favourite')}
            color={story.isFavourite ? theme.colors.accent : undefined}
            onPress={() => {
              toggleFavourite.mutate({ id: story.id, favourite: !story.isFavourite });
            }}
          />
        }
      />

      <View style={styles.cover}>
        {story.coverImageUrl ? (
          <Image
            source={{ uri: story.coverImageUrl }}
            style={[styles.coverImage, { borderRadius: theme.radius.xl }]}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={[
              styles.coverImage,
              { borderRadius: theme.radius.xl, backgroundColor: theme.colors.secondary },
            ]}
          >
            <Icon name="book" size={40} color={theme.colors.primary} />
          </View>
        )}
      </View>

      <Text variant="h2" align="center" style={styles.title}>
        {story.title}
      </Text>

      <View style={styles.metaRow}>
        {story.childName ? (
          <Badge label={t('story.preparedFor', { name: story.childName })} tone="primary" />
        ) : null}
        <Badge label={AGE_BAND_RULES[story.ageRange].label} />
        {readyNarration?.durationSeconds ? (
          <Badge label={formatDuration(readyNarration.durationSeconds)} />
        ) : null}
      </View>

      {readyNarration ? (
        <Button
          label={t('story.listen')}
          leadingIcon={<Icon name="play" size={18} color={theme.colors.primaryForeground} />}
          onPress={() => {
            router.push({
              pathname: '/player/[narrationId]',
              params: { narrationId: readyNarration.id },
            });
          }}
          style={styles.primaryAction}
        />
      ) : (
        <Button
          label={t('story.renarrate')}
          variant="secondary"
          onPress={() => {
            router.push({ pathname: '/story/[id]/narrate', params: { id: story.id } });
          }}
          style={styles.primaryAction}
        />
      )}

      <Button
        label={t('story.read')}
        variant="tertiary"
        onPress={() => {
          router.push({ pathname: '/story/[id]/read', params: { id: story.id } });
        }}
        style={styles.secondaryAction}
      />

      {excerpt.length > 0 ? (
        <Card variant="muted" padding={16} style={styles.excerpt}>
          <Text variant="caption" tone="muted">
            {t('story.excerptTitle')}
          </Text>
          <Text variant="bodyStory" numberOfLines={4} style={styles.excerptText}>
            {excerpt}
          </Text>
        </Card>
      ) : null}

      <Card variant="flat" padding={12} style={styles.actions}>
        <ListItem
          title={t('story.renarrate')}
          icon="microphone"
          onPress={() => {
            router.push({ pathname: '/story/[id]/narrate', params: { id: story.id } });
          }}
        />
        <Divider />
        <ListItem
          title={t('story.illustrate')}
          icon="image"
          subtitle={story.hasIllustrations ? undefined : t('illustration.subtitle')}
          onPress={() => {
            if (story.hasIllustrations) {
              router.push({ pathname: '/story/[id]/illustrate', params: { id: story.id } });
            } else {
              illustrate.mutate();
            }
          }}
        />
        <Divider />
        <ListItem
          title={t('story.makeBook')}
          icon="book"
          onPress={() => {
            router.push({ pathname: '/story/[id]/illustrate', params: { id: story.id } });
          }}
        />
        <Divider />
        <ListItem
          title={t('story.edit')}
          icon="edit"
          onPress={() => {
            router.push({ pathname: '/story/[id]/edit', params: { id: story.id } });
          }}
        />
        <Divider />
        <ListItem
          title={t('common.delete')}
          icon="trash"
          tone="destructive"
          showChevron={false}
          onPress={() => {
            setConfirmDelete(true);
          }}
        />
      </Card>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('story.deleteConfirmTitle')}
        message={t('story.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        tone="destructive"
        loading={deleteStory.isPending}
        onConfirm={() => {
          deleteStory.mutate(story.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              router.back();
            },
            onError: (cause: unknown) => {
              setConfirmDelete(false);
              toast.show({ message: errorCopy(cause).message, tone: 'error' });
            },
          });
        }}
        onCancel={() => {
          setConfirmDelete(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', marginTop: 8 },
  coverImage: {
    width: '76%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 24 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  primaryAction: { marginTop: 24 },
  secondaryAction: { marginTop: 10 },
  excerpt: { marginTop: 24, gap: 6 },
  excerptText: { marginTop: 4 },
  actions: { marginTop: 24, marginBottom: 24 },
});
