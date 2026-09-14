import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BottomSheet,
  Button,
  ErrorState,
  IconButton,
  ListItem,
  LoadingState,
  palette,
  ProgressBar,
  Text,
  useTheme,
} from '@masalim/ui';
import { ANALYTICS_EVENTS, type NarrationDto } from '@masalim/types';
import { analytics } from '../../src/lib/analytics';
import { api } from '../../src/lib/api';
import {
  useNarration,
  useNarrationSegments,
  useStory,
} from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';
import { formatDuration } from '../../src/lib/format';

const SKIP_SECONDS = 15;
const SPEEDS = [0.8, 1, 1.2] as const;
const SLEEP_TIMER_MINUTES = [5, 10, 15, 30] as const;
/** How often playback position is reported to the server. */
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

/**
 * The audio player.
 *
 * Night-themed and one-handed: a parent is holding a phone in a dark room next
 * to a child who is falling asleep. The controls are large, the background is
 * dark, and the sleep timer is a first-class control rather than something
 * buried in settings.
 *
 * Position is saved periodically and on unmount so Home can offer "Kaldığın
 * yerden devam et" tomorrow. Audio is configured to keep playing when the screen
 * locks — the whole point is that the child listens as they drift off.
 */
/**
 * Waits for the narration, then hands a ready one to the screen that plays it.
 *
 * The split is what guarantees `Player` mounts its audio hook once, against a
 * source that exists. Fetching and playing in one component meant the player
 * was created empty and replaced the moment the data arrived, which released a
 * native object other effects were still holding.
 */
export default function PlayerScreen() {
  const { t, errorCopy } = useI18n();
  const { narrationId } = useLocalSearchParams<{ narrationId: string }>();
  const { data: narration, isPending, isError, refetch } = useNarration(narrationId ?? null);

  if (isPending) {
    return (
      <NightScreen>
        <LoadingState label={t('common.loading')} />
      </NightScreen>
    );
  }

  // No audio is not a loading state. A narration can be READY in the database
  // while its file is unreachable — free hosting keeps uploads on a disk that
  // does not survive a restart — and rendering transport controls over nothing
  // leaves a parent pressing play at silence.
  if (isError || !narration || !narration.audioUrl) {
    return (
      <NightScreen>
        <ErrorState
          title={errorCopy(null).title}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </NightScreen>
    );
  }

  return <Player narration={narration} audioUrl={narration.audioUrl} />;
}

function Player({
  narration,
  audioUrl,
}: {
  narration: NarrationDto;
  audioUrl: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const narrationId = narration.id;

  const { data: story } = useStory(narration.storyId);
  const { data: segments = [] } = useNarrationSegments(narrationId);

  const player = useAudioPlayer({ uri: audioUrl });
  const status = useAudioPlayerStatus(player);

  const [speedSheetOpen, setSpeedSheetOpen] = useState(false);
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [showText, setShowText] = useState(true);
  const lastSavedAt = useRef(0);
  // The last position we saw, mirrored out of the status so it can be read
  // after the player it came from is gone. See the unmount save below.
  const lastPosition = useRef(0);
  const playbackStartedFor = useRef<string | null>(null);
  const completionReportedFor = useRef<string | null>(null);

  // Background playback and silent-switch behaviour. Without this, iOS stops the
  // narration the moment the screen locks.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
  }, []);

  const saveProgress = useCallback(
    (positionSeconds: number, completed: boolean) => {
      if (!narration || !narrationId) return;
      void api.stories
        .saveProgress(narration.storyId, {
          narrationId,
          positionSeconds: Math.max(0, Math.floor(positionSeconds)),
          completed,
        })
        .catch(() => undefined);
    },
    [narration, narrationId],
  );

  useEffect(() => {
    lastPosition.current = status.currentTime;
  }, [status.currentTime]);

  useEffect(() => {
    if (!status.playing) return;
    const now = Date.now();
    if (now - lastSavedAt.current < PROGRESS_SAVE_INTERVAL_MS) return;
    lastSavedAt.current = now;
    saveProgress(status.currentTime, false);
  }, [saveProgress, status.currentTime, status.playing]);

  // One last save on the way out, so closing mid-story is not lost.
  //
  // The position comes from the ref rather than from `player`, and the effect
  // deliberately does not depend on `player` at all. This cleanup runs whenever
  // its dependencies change, not only on unmount — and `player` changes
  // identity as soon as the narration loads and a real source replaces the
  // empty one. React runs the old cleanup after `useAudioPlayer` has already
  // released that old player, so reading a property off it threw from native
  // code, past any JavaScript that could have caught it, and took the app down
  // with it the moment the screen opened.
  useEffect(
    () => () => {
      saveProgress(lastPosition.current, false);
    },
    [saveProgress],
  );

  useEffect(() => {
    if (status.didJustFinish) saveProgress(status.duration, true);
  }, [saveProgress, status.didJustFinish, status.duration]);

  // Reported on the first transition into playing, not on every resume: pausing
  // to answer a question and pressing play again is one listen, not two.
  useEffect(() => {
    if (!status.playing || !narration) return;
    if (playbackStartedFor.current === narration.id) return;
    playbackStartedFor.current = narration.id;
    analytics.capture(ANALYTICS_EVENTS.PLAYBACK_STARTED, {
      is_parent_voice: narration.voiceProfileId !== null,
      duration_seconds: Math.round(narration.durationSeconds ?? status.duration),
    });
  }, [narration, status.duration, status.playing]);

  // `didJustFinish` is the audio actually reaching the end — closing the screen
  // part-way through is a save, never a completion.
  useEffect(() => {
    if (!status.didJustFinish || !narration) return;
    if (completionReportedFor.current === narration.id) return;
    completionReportedFor.current = narration.id;
    analytics.capture(ANALYTICS_EVENTS.PLAYBACK_COMPLETED, {
      is_parent_voice: narration.voiceProfileId !== null,
      duration_seconds: Math.round(status.duration || (narration.durationSeconds ?? 0)),
    });
  }, [narration, status.didJustFinish, status.duration]);

  // Sleep timer: pauses rather than closing, so the story is still there.
  useEffect(() => {
    if (sleepMinutes === null) return;
    const timer = setTimeout(
      () => {
        player.pause();
        setSleepMinutes(null);
      },
      sleepMinutes * 60 * 1000,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [player, sleepMinutes]);

  const activeSegment = useMemo(() => {
    if (segments.length === 0) return null;
    return (
      segments.find(
        (segment) =>
          status.currentTime >= segment.startSeconds && status.currentTime < segment.endSeconds,
      ) ?? null
    );
  }, [segments, status.currentTime]);

  const duration = status.duration > 0 ? status.duration : (narration.durationSeconds ?? 0);

  return (
    <NightScreen>
      <View style={styles.header}>
        <IconButton
          name="down"
          accessibilityLabel={t('common.close')}
          color={palette.cream}
          onPress={() => {
            router.back();
          }}
        />
        <Text variant="caption" style={{ color: palette.lavender }}>
          {t('player.nowPlaying')}
        </Text>
        <IconButton
          name="clock"
          accessibilityLabel={t('player.sleepTimer')}
          color={sleepMinutes ? palette.gold : palette.cream}
          onPress={() => {
            setTimerSheetOpen(true);
          }}
        />
      </View>

      <View style={styles.art}>
        <Text variant="hero">🌙</Text>
      </View>

      <Text variant="h4" align="center" style={{ color: palette.cream }}>
        {story?.title ?? ''}
      </Text>
      <Text variant="small" align="center" style={[styles.narrator, { color: palette.lavender }]}>
        {t('story.narratedBy', { name: narration.narratorLabel })}
      </Text>

      {showText && activeSegment ? (
        <ScrollView style={styles.transcript} showsVerticalScrollIndicator={false}>
          <Text
            variant="bodyStory"
            align="center"
            accessibilityLiveRegion="polite"
            style={{ color: palette.cream }}
          >
            {activeSegment.text}
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.transcript} />
      )}

      <ProgressBar
        value={duration > 0 ? status.currentTime / duration : 0}
        trackColor={`${palette.lavender}33`}
        fillColor={palette.lavender}
        style={styles.progress}
      />
      <View style={styles.times}>
        <Text variant="caption" style={{ color: palette.lavender }}>
          {formatDuration(status.currentTime)}
        </Text>
        <Text variant="caption" style={{ color: palette.lavender }}>
          {formatDuration(duration)}
        </Text>
      </View>

      <View style={styles.controls}>
        <IconButton
          name="skipBack"
          accessibilityLabel={t('player.back15')}
          color={palette.cream}
          size={52}
          onPress={() => {
            void player.seekTo(Math.max(0, player.currentTime - SKIP_SECONDS));
          }}
        />
        <IconButton
          name={status.playing ? 'pause' : 'play'}
          accessibilityLabel={status.playing ? t('player.pause') : t('player.play')}
          variant="primary"
          size={76}
          iconSize={30}
          onPress={() => {
            if (status.playing) player.pause();
            else player.play();
          }}
        />
        <IconButton
          name="skipForward"
          accessibilityLabel={t('player.forward15')}
          color={palette.cream}
          size={52}
          onPress={() => {
            void player.seekTo(Math.min(duration, player.currentTime + SKIP_SECONDS));
          }}
        />
      </View>

      <View style={styles.secondaryControls}>
        <Button
          label={`${String(player.playbackRate)}×`}
          variant="tertiary"
          size="small"
          fullWidth={false}
          onPress={() => {
            setSpeedSheetOpen(true);
          }}
        />
        <Button
          label={showText ? t('story.hideText') : t('story.showText')}
          variant="tertiary"
          size="small"
          fullWidth={false}
          onPress={() => {
            setShowText((current) => !current);
          }}
        />
      </View>

      <BottomSheet
        visible={speedSheetOpen}
        onClose={() => {
          setSpeedSheetOpen(false);
        }}
        title={t('player.speed')}
        closeLabel={t('common.close')}
      >
        {SPEEDS.map((speed) => (
          <ListItem
            key={speed}
            title={`${String(speed)}×`}
            onPress={() => {
              player.setPlaybackRate(speed);
              setSpeedSheetOpen(false);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={timerSheetOpen}
        onClose={() => {
          setTimerSheetOpen(false);
        }}
        title={t('player.sleepTimer')}
        closeLabel={t('common.close')}
      >
        <ListItem
          title={t('player.sleepTimerOff')}
          onPress={() => {
            setSleepMinutes(null);
            setTimerSheetOpen(false);
          }}
        />
        {SLEEP_TIMER_MINUTES.map((minutes) => (
          <ListItem
            key={minutes}
            title={t('player.sleepTimerMinutes', { count: minutes })}
            onPress={() => {
              setSleepMinutes(minutes);
              setTimerSheetOpen(false);
              analytics.capture(ANALYTICS_EVENTS.SLEEP_TIMER_SET, { minutes });
            }}
          />
        ))}
      </BottomSheet>
    </NightScreen>
  );
}

function NightScreen({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[...theme.gradients.night.colors]}
      locations={[...theme.gradients.night.locations]}
      start={theme.gradients.night.start}
      end={theme.gradients.night.end}
      style={styles.root}
    >
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  art: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  narrator: { marginTop: 6 },
  transcript: { flex: 1, marginTop: 24, marginBottom: 8 },
  progress: { marginTop: 8 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 24,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 24,
  },
});
