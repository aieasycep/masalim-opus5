import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import type { VoiceProfileDto } from '@masalim/types';
import { useAppConfig, useDeleteVoice, useVoices } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';
import { formatShortDate } from '../../src/lib/format';

/**
 * What we hold of a parent's voice, and how to be rid of it.
 *
 * This is the screen the consent given during enrolment points at, so it has to
 * answer the questions that consent raised: what is stored, what it is used
 * for, how long the raw recording survives, and how to delete it. The retention
 * window is read from the server's config rather than written into the copy,
 * because a number stated here that the retention job does not honour would be
 * a false promise.
 *
 * Deleting removes the voice at the provider before forgetting it locally. That
 * ordering matters: the reverse would leave a cloned voice on a third party's
 * servers with nothing left pointing at it (§46, §84).
 */
export default function VoiceDataScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, locale, errorCopy } = useI18n();

  const { data: voices = [], isPending } = useVoices();
  const { data: config } = useAppConfig();
  const remove = useDeleteVoice();

  const [deleting, setDeleting] = useState<VoiceProfileDto | null>(null);

  return (
    <Screen>
      <ScreenHeader
        title={t('settings.voiceDataTitle')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="body" tone="muted" style={styles.body}>
        {t('settings.voiceDataBody')}
      </Text>

      {/* The real retention window, not a number typed into the copy. */}
      {config ? (
        <Card style={styles.retention}>
          <Icon name="clock" size={18} color={theme.colors.mutedForeground} />
          <Text variant="small" tone="muted" style={styles.retentionText}>
            {t('settings.voiceDataRetention', { days: config.voiceRawRetentionDays })}
          </Text>
        </Card>
      ) : null}

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : voices.length === 0 ? (
        <EmptyState
          icon="microphone"
          title={t('empty.voicesTitle')}
          description={t('empty.voicesBody')}
          actionLabel={t('empty.voicesCta')}
          onAction={() => {
            router.push('/voice');
          }}
        />
      ) : (
        <View style={styles.list}>
          {voices.map((voice) => (
            <Card key={voice.id} style={styles.row}>
              <Avatar name={voice.displayName} kind="parentVoice" size={40} />

              <View style={styles.rowBody}>
                <Text variant="title" numberOfLines={1}>
                  {voice.displayName}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatShortDate(voice.createdAt, locale)}
                </Text>
                {voice.consentAcceptedAt ? (
                  <Badge label={t('voice.consentAccept')} tone="success" />
                ) : null}
              </View>

              <IconButton
                name="trash"
                accessibilityLabel={`${t('voice.menuDelete')} — ${voice.displayName}`}
                color={theme.colors.destructive}
                onPress={() => {
                  setDeleting(voice);
                }}
              />
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={deleting !== null}
        title={t('voice.deleteTitle')}
        message={t('voice.deleteBody')}
        confirmLabel={t('voice.deleteConfirm')}
        cancelLabel={t('common.cancel')}
        tone="destructive"
        loading={remove.isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          remove.mutate(target.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.show({ message: t('voice.deleted'), tone: 'success' });
            },
            onError: (cause) => {
              setDeleting(null);
              toast.show({ message: errorCopy(cause).message, tone: 'error' });
            },
          });
        }}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 12 },
  retention: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20 },
  retentionText: { flex: 1 },
  list: { gap: 12, marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
});
