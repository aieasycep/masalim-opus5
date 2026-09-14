import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Input,
  ListItem,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import {
  ANALYTICS_EVENTS,
  type VoiceProfileDto,
  type VoiceProfileStatus,
} from '@masalim/types';
import { useDeleteVoice, useRenameVoice, useVoices } from '../../src/hooks/queries';
import { useVoiceEnrolment } from '../../src/stores/voice-enrolment';
import { analytics } from '../../src/lib/analytics';
import { useI18n } from '../../src/i18n';

const STATUS_LABEL: Readonly<Record<VoiceProfileStatus, string>> = {
  AWAITING_RECORDING: 'voice.statusProcessing',
  UPLOADED: 'voice.statusProcessing',
  PROCESSING: 'voice.statusProcessing',
  READY: 'voice.statusReady',
  FAILED: 'voice.statusFailed',
  DELETING: 'voice.statusDeleting',
};

/**
 * Ses Stüdyom — the home of the parent's own voices.
 *
 * Every voice is listed with its real state, including the ones still being
 * cloned and the ones that failed. A profile stuck at PROCESSING is not hidden
 * until it works: a parent who recorded a minute of their voice an hour ago is
 * owed an answer about where it went.
 */
export default function VoiceStudioScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();
  const toast = useToast();

  const { data: voices = [], isPending, isError, refetch } = useVoices();
  const rename = useRenameVoice();
  const remove = useDeleteVoice();
  const resetEnrolment = useVoiceEnrolment((state) => state.reset);

  const [menuFor, setMenuFor] = useState<VoiceProfileDto | null>(null);
  const [renaming, setRenaming] = useState<VoiceProfileDto | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<VoiceProfileDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const player = useAudioPlayer(previewUrl ? { uri: previewUrl } : null);

  const startEnrolment = (): void => {
    // A fresh run: nothing from an abandoned attempt should leak into this one.
    resetEnrolment();
    router.push('/voice/intro');
  };

  if (isError) {
    return (
      <Screen>
        <ScreenHeader
          title={t('voice.studioTitle')}
          onBack={() => {
            router.back();
          }}
        />
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

  return (
    <Screen footerHeight={96}>
      <ScreenHeader
        title={t('voice.studioTitle')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="h3" style={styles.headline}>
        {t('voice.studioHeadline')}
      </Text>
      <Text variant="body" tone="muted" style={styles.subtitle}>
        {t('voice.studioSubtitle')}
      </Text>

      {isPending ? (
        <View style={styles.list}>
          <Skeleton height={72} radiusToken="md" />
          <Skeleton height={72} radiusToken="md" />
        </View>
      ) : voices.length === 0 ? (
        <EmptyState
          icon="microphone"
          title={t('empty.voicesTitle')}
          description={t('empty.voicesBody')}
          actionLabel={t('empty.voicesCta')}
          onAction={startEnrolment}
        />
      ) : (
        <View style={styles.list}>
          <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
            {t('voice.familyVoices')}
          </Text>

          {voices.map((voice) => (
            <Card key={voice.id} style={styles.voiceCard}>
              <Avatar name={voice.displayName} kind="parentVoice" size={44} />

              <View style={styles.voiceBody}>
                <Text variant="title" numberOfLines={1}>
                  {voice.displayName}
                </Text>
                <Badge
                  label={t(STATUS_LABEL[voice.status])}
                  tone={
                    voice.status === 'READY'
                      ? 'success'
                      : voice.status === 'FAILED'
                        ? 'destructive'
                        : 'neutral'
                  }
                />
              </View>

              <IconButton
                name="moreHorizontal"
                accessibilityLabel={voice.displayName}
                onPress={() => {
                  setMenuFor(voice);
                }}
              />
            </Card>
          ))}

          <Button
            label={t('voice.addVoice')}
            variant="secondary"
            leadingIcon={<Icon name="plus" size={18} color={theme.colors.primary} />}
            style={styles.addButton}
            onPress={startEnrolment}
          />
        </View>
      )}

      {/* Per-voice actions. */}
      <BottomSheet
        visible={menuFor !== null}
        title={menuFor?.displayName}
        closeLabel={t('common.close')}
        onClose={() => {
          setMenuFor(null);
        }}
      >
        {menuFor?.previewUrl ? (
          <ListItem
            title={t('voice.menuListen')}
            icon="play"
            onPress={() => {
              setPreviewUrl(menuFor.previewUrl);
              player.play();
              setMenuFor(null);
            }}
          />
        ) : null}

        <ListItem
          title={t('voice.menuRename')}
          icon="edit"
          onPress={() => {
            setRenameValue(menuFor?.displayName ?? '');
            setRenaming(menuFor);
            setMenuFor(null);
          }}
        />

        <ListItem
          title={t('voice.menuRerecord')}
          icon="microphone"
          onPress={() => {
            setMenuFor(null);
            startEnrolment();
          }}
        />

        <ListItem
          title={t('voice.menuDelete')}
          icon="trash"
          tone="destructive"
          onPress={() => {
            setDeleting(menuFor);
            setMenuFor(null);
          }}
        />
      </BottomSheet>

      {/* Rename. */}
      <BottomSheet
        visible={renaming !== null}
        title={t('voice.renameTitle')}
        closeLabel={t('common.close')}
        onClose={() => {
          setRenaming(null);
        }}
        footer={
          <Button
            label={t('common.save')}
            loading={rename.isPending}
            disabled={renameValue.trim().length === 0}
            onPress={() => {
              const target = renaming;
              if (!target) return;
              rename.mutate(
                { id: target.id, displayName: renameValue.trim() },
                {
                  onSuccess: () => {
                    setRenaming(null);
                  },
                  onError: (error) => {
                    toast.show({ message: errorCopy(error).message, tone: 'error' });
                  },
                },
              );
            }}
          />
        }
      >
        <Input
          label={t('voice.ownerNameLabel')}
          value={renameValue}
          onChangeText={setRenameValue}
          maxLength={40}
          showCounter
          autoFocus
        />
      </BottomSheet>

      {/*
        Deleting a voice deletes it at the provider too — the confirmation says
        what it costs rather than asking "are you sure?" about nothing.
      */}
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
              analytics.capture(ANALYTICS_EVENTS.VOICE_DELETED, {
                owner_type: target.ownerType,
                status: target.status,
                source: 'studio',
              });
              setDeleting(null);
              toast.show({ message: t('voice.deleted') });
            },
            onError: (error) => {
              setDeleting(null);
              toast.show({ message: errorCopy(error).message, tone: 'error' });
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
  headline: { marginTop: 8 },
  subtitle: { marginTop: 8, marginBottom: 24 },
  list: { gap: 12 },
  sectionLabel: { marginBottom: 4 },
  voiceCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  voiceBody: { flex: 1, gap: 6, alignItems: 'flex-start' },
  addButton: { marginTop: 12 },
});
