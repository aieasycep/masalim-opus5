import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  LoadingState,
  OptionCard,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { ANALYTICS_EVENTS, ILLUSTRATION_STYLES, type IllustrationStyle } from '@masalim/types';
import { isApiError } from '@masalim/api-client';
import { analytics } from '../../../src/lib/analytics';
import {
  useCreateIllustrationSet,
  useIllustrationSets,
  useRegenerateIllustration,
  useSelectIllustration,
} from '../../../src/hooks/queries';
import { useI18n } from '../../../src/i18n';

const STYLE_KEYS: Readonly<Record<IllustrationStyle, string>> = {
  watercolor: 'illustration.styleWatercolor',
  soft3d: 'illustration.styleSoft3d',
  classic_storybook: 'illustration.styleClassic',
  pastel: 'illustration.stylePastel',
  hand_drawn: 'illustration.styleHandDrawn',
};

/**
 * Illustrating a story.
 *
 * The client sends a style *key*, never a prompt. The prompt templates and the
 * character description that keeps the hero recognisable across twelve pages
 * both live on the server, which is what stops the app from becoming an
 * uncontrolled prompt surface — and what makes the consistency promise
 * something the backend can actually keep (§27).
 *
 * Progress is the set's own `readyCount / totalCount`, so "7 / 12" is a fact
 * rather than an animation.
 */
export default function IllustrateScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();
  const { id: storyId } = useLocalSearchParams<{ id: string }>();

  const { data: sets = [], isPending } = useIllustrationSets(storyId ?? null);
  const createSet = useCreateIllustrationSet();
  const regenerate = useRegenerateIllustration();
  const selectVariant = useSelectIllustration();

  const [style, setStyle] = useState<IllustrationStyle>('watercolor');

  const existing = sets.at(0) ?? null;

  if (isPending) {
    return (
      <Screen>
        <ScreenHeader
          title={t('story.illustrate')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  // A story that already has images: show them, with per-page control.
  if (existing) {
    const done = existing.status === 'READY';

    return (
      <Screen>
        <ScreenHeader
          title={t('story.illustrate')}
          onBack={() => {
            router.back();
          }}
        />

        {!done ? (
          <Card style={styles.progress}>
            <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
              {t('illustration.generatingPage', {
                current: existing.readyCount,
                total: existing.totalCount,
              })}
            </Text>
            <ProgressBar
              value={
                existing.totalCount > 0 ? existing.readyCount / existing.totalCount : 0
              }
            />
          </Card>
        ) : null}

        <View style={styles.grid}>
          {existing.illustrations.map((illustration) => (
            <Card key={illustration.id} style={styles.tile} padding={0}>
              {illustration.imageUrl ? (
                <Image
                  source={{ uri: illustration.imageUrl }}
                  style={[styles.image, { borderRadius: theme.radius.md }]}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.image,
                    styles.placeholder,
                    { backgroundColor: theme.colors.muted, borderRadius: theme.radius.md },
                  ]}
                >
                  <Icon
                    name={illustration.status === 'FAILED' ? 'alert' : 'image'}
                    size={20}
                    color={theme.colors.mutedForeground}
                  />
                </View>
              )}

              <View style={styles.tileFooter}>
                {illustration.kind === 'COVER' ? (
                  <Badge label={t('book.coverTitle')} tone="primary" />
                ) : null}

                <View style={styles.tileActions}>
                  {/* Only a finished image can be replaced or chosen. */}
                  {!illustration.isSelected && illustration.status === 'READY' ? (
                    <IconButton
                      name="check"
                      accessibilityLabel={t('illustration.chooseVariant')}
                      size={36}
                      iconSize={16}
                      disabled={selectVariant.isPending}
                      onPress={() => {
                        selectVariant.mutate(illustration.id, {
                          onError: (cause) => {
                            toast.show({ message: errorCopy(cause).message, tone: 'error' });
                          },
                        });
                      }}
                    />
                  ) : null}

                  <IconButton
                    name="refresh"
                    accessibilityLabel={t('illustration.regenerate')}
                    size={36}
                    iconSize={16}
                    disabled={regenerate.isPending || illustration.status === 'PROCESSING'}
                    onPress={() => {
                      regenerate.mutate(
                        {
                          illustrationId: illustration.id,
                          setId: existing.id,
                          idempotencyKey: Crypto.randomUUID(),
                        },
                        {
                          onSuccess: () => {
                            analytics.capture(ANALYTICS_EVENTS.ILLUSTRATION_REGENERATED, {
                              illustration_style: existing.style,
                              illustration_kind: illustration.kind,
                            });
                          },
                          onError: (cause) => {
                            toast.show({ message: errorCopy(cause).message, tone: 'error' });
                          },
                        },
                      );
                    }}
                  />
                </View>
              </View>
            </Card>
          ))}
        </View>

        {done ? (
          <Button
            label={t('story.makeBook')}
            style={styles.cta}
            onPress={() => {
              router.push({ pathname: '/story/[id]', params: { id: storyId ?? '' } });
            }}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen footerHeight={130}>
      <ScreenHeader
        title={t('story.illustrate')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h4" style={styles.title}>
        {t('illustration.title')}
      </Text>
      <Text variant="body" tone="muted" style={styles.subtitle}>
        {t('illustration.subtitle')}
      </Text>

      {ILLUSTRATION_STYLES.map((candidate) => (
        <OptionCard
          key={candidate}
          title={t(STYLE_KEYS[candidate])}
          selected={style === candidate}
          style={styles.option}
          onPress={() => {
            setStyle(candidate);
          }}
        />
      ))}

      <Card style={styles.consistency}>
        <Icon name="sparkle" size={18} color={theme.colors.primary} />
        <Text variant="small" tone="muted" style={styles.consistencyText}>
          {t('illustration.consistencyNote')}
        </Text>
      </Card>

      <Button
        label={t('illustration.generate')}
        loading={createSet.isPending}
        style={styles.cta}
        onPress={() => {
          if (!storyId) return;
          analytics.capture(ANALYTICS_EVENTS.ILLUSTRATION_GENERATION_STARTED, {
            illustration_style: style,
          });
          createSet.mutate(
            { storyId, input: { style, idempotencyKey: Crypto.randomUUID() } },
            {
              onSuccess: ({ job }) => {
                router.replace({
                  pathname: '/generating/[jobId]',
                  params: { jobId: job.id, storyId },
                });
              },
              onError: (cause) => {
                // The request never became a job, so the set-level effect above
                // will never see this one.
                analytics.capture(ANALYTICS_EVENTS.ILLUSTRATION_GENERATION_FAILED, {
                  illustration_style: style,
                  error_code: isApiError(cause) ? cause.code : null,
                  stage: 'request',
                });
                toast.show({ message: errorCopy(cause).message, tone: 'error' });
              },
            },
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8 },
  subtitle: { marginTop: 8, marginBottom: 20 },
  option: { marginBottom: 10 },
  consistency: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  consistencyText: { flex: 1 },
  progress: { gap: 10, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  tile: { width: '47%', overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  tileFooter: { padding: 10, gap: 8 },
  tileActions: { flexDirection: 'row', gap: 8 },
  cta: { marginTop: 24 },
});
