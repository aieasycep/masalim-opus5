import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { WebView } from 'react-native-webview';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, watchJob, type ApiError } from '@masalim/api-client';
import type { AIJobDto } from '@masalim/types';
import {
  Button,
  Card,
  Icon,
  LoadingState,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { useBook, useBookRenders, useRenderBook } from '../../../src/hooks/queries';
import { http } from '../../../src/lib/api';
import { useI18n } from '../../../src/i18n';

/**
 * The finished book, as a parent will see it.
 *
 * Rendering is a job, not a request — a full-colour twelve-page book takes long
 * enough that the screen follows the job's real steps rather than blocking.
 *
 * Ordering is offered only when the book is genuinely print-ready: every page
 * and the cover illustrated. The server refuses anything else, so a button that
 * ignored that would send a parent to a checkout that bounces. When it is not
 * ready the screen says which piece is missing instead.
 */
export default function BookPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const client = useQueryClient();
  const { t, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: book, isPending } = useBook(id ?? null);
  const { data: renders = [] } = useBookRenders(id ?? null);
  const renderBook = useRenderBook();

  const [job, setJob] = useState<AIJobDto | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = renders.find(
    (render) => render.kind === 'DIGITAL_PREVIEW' && render.status === 'READY',
  );

  useEffect(() => {
    if (!jobId) return;

    return watchJob(http, jobId, {
      onProgress: setJob,
      onSettled: (settled) => {
        setJob(settled);
        setJobId(null);
        void client.invalidateQueries({ queryKey: queryKeys.books.renders(id ?? '') });

        if (settled.status !== 'COMPLETED') {
          setError(
            settled.errorCode
              ? errorCopy({ name: 'ApiError', code: settled.errorCode }).message
              : errorCopy(null).message,
          );
        }
      },
      onError: (cause: ApiError) => {
        setJobId(null);
        setError(errorCopy(cause).message);
      },
    });
  }, [client, errorCopy, id, jobId]);

  if (isPending || !book) {
    return (
      <Screen>
        <ScreenHeader
          title={t('book.previewTitle')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  // The same condition the server enforces before it will take an order.
  const missingIllustrations = book.pages.filter((page) => !page.imageUrl).length;
  const printReady = missingIllustrations === 0 && book.coverImageUrl !== null;

  const render = (): void => {
    if (!id) return;
    setError(null);

    renderBook.mutate(
      { id, input: { kind: 'DIGITAL_PREVIEW', idempotencyKey: Crypto.randomUUID() } },
      {
        onSuccess: ({ job: started }) => {
          setJobId(started.id);
          setJob(started);
        },
        onError: (cause) => {
          setError(errorCopy(cause).message);
        },
      },
    );
  };

  const rendering = jobId !== null || renderBook.isPending;

  return (
    <Screen scroll={preview === undefined} footerHeight={preview ? 0 : 120}>
      <ScreenHeader
        title={t('book.previewTitle')}
        onBack={() => {
          router.back();
        }}
      />

      {preview?.fileUrl ? (
        <>
          <WebView source={{ uri: preview.fileUrl }} style={styles.viewer} />

          <View style={styles.viewerActions}>
            <Button
              label={t('book.print')}
              disabled={!printReady}
              onPress={() => {
                router.push({
                  pathname: '/order/configure/[bookId]',
                  params: { bookId: book.id },
                });
              }}
            />
          </View>
        </>
      ) : rendering ? (
        <Card style={styles.progress}>
          <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
            {job?.currentStepKey ? t(job.currentStepKey) : t('common.loading')}
          </Text>
          <ProgressBar
            value={job ? job.completedSteps / Math.max(1, job.totalSteps) : 0}
          />
        </Card>
      ) : (
        <>
          {/* Says exactly what is missing rather than just disabling the button. */}
          {!printReady ? (
            <Card style={styles.notice}>
              <Icon name="info" size={18} color={theme.colors.mutedForeground} />
              <Text variant="small" tone="muted" style={styles.noticeText}>
                {missingIllustrations > 0
                  ? t('illustration.generatingPage', {
                      current: book.pages.length - missingIllustrations,
                      total: book.pages.length,
                    })
                  : t('illustration.title')}
              </Text>
            </Card>
          ) : null}

          {error ? (
            <Card style={styles.notice}>
              <Icon name="alert" size={18} color={theme.colors.destructive} />
              <Text
                variant="small"
                tone="muted"
                style={styles.noticeText}
                accessibilityLiveRegion="polite"
              >
                {error}
              </Text>
            </Card>
          ) : null}

          <Button label={t('book.preview')} style={styles.cta} onPress={render} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, marginTop: 12 },
  viewerActions: { paddingVertical: 16 },
  progress: { gap: 12, marginTop: 24 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20 },
  noticeText: { flex: 1 },
  cta: { marginTop: 28 },
});
