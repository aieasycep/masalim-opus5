import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { parseDeepLink, type NotificationDto, type NotificationType } from '@masalim/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
  useToast,
  type IconName,
} from '@masalim/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../src/hooks/queries';
import { useI18n } from '../src/i18n';
import { formatShortDate } from '../src/lib/format';

const ICONS: Readonly<Record<NotificationType, IconName>> = {
  STORY_READY: 'book',
  STORY_FAILED: 'alert',
  VOICE_READY: 'microphone',
  VOICE_FAILED: 'alert',
  ILLUSTRATIONS_READY: 'image',
  BOOK_READY: 'book',
  ORDER_CONFIRMED: 'truck',
  ORDER_SHIPPED: 'truck',
  ORDER_DELIVERED: 'truck',
  SUBSCRIPTION_RENEWED: 'star',
  SUBSCRIPTION_EXPIRED: 'star',
};

/**
 * The notification centre.
 *
 * The durable record of everything the app has told a parent, whether or not a
 * push ever reached the phone — notifications are written server-side before
 * delivery is attempted, so this list is the one place the news cannot be missed.
 *
 * Every row carries the deep link the push carried, so tapping "Masalın hazır"
 * here lands in exactly the same place as tapping the banner would have.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, errorCopy } = useI18n();

  const { data: notifications = [], isPending, isError, error, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications.filter((item) => item.readAt === null).length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => {
      setRefreshing(false);
    });
  }, [refetch]);

  const open = (notification: NotificationDto): void => {
    // Read state is a server fact; the row only changes once the write lands and
    // the list comes back saying so.
    if (notification.readAt === null) markRead.mutate(notification.id);

    const raw = notification.data.deepLink;
    const link = raw ? parseDeepLink(raw) : null;
    if (!link) return;

    switch (link.host) {
      case 'story':
        if (link.id) router.push({ pathname: '/story/[id]', params: { id: link.id } });
        return;
      case 'book':
        if (link.id) router.push({ pathname: '/book/[id]/preview', params: { id: link.id } });
        return;
      case 'order':
        if (link.id) router.push({ pathname: '/order/[id]', params: { id: link.id } });
        return;
      case 'job':
        if (link.id) router.push({ pathname: '/generating/[jobId]', params: { jobId: link.id } });
        return;
      case 'voice':
        router.push('/voice');
        return;
      case 'subscription':
        router.push('/subscription');
        return;
    }
  };

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ScreenHeader
        title={t('notification.title')}
        onBack={() => {
          router.back();
        }}
        action={
          unreadCount > 0 ? (
            <Button
              label={t('notification.markAllRead')}
              variant="tertiary"
              size="small"
              fullWidth={false}
              loading={markAllRead.isPending}
              onPress={() => {
                markAllRead.mutate(undefined, {
                  onError: (cause) => {
                    toast.show({ message: errorCopy(cause).message, tone: 'error' });
                  },
                });
              }}
            />
          ) : null
        }
      />

      {isPending ? (
        <View style={styles.list}>
          <Skeleton height={78} radiusToken="md" />
          <Skeleton height={78} radiusToken="md" />
          <Skeleton height={78} radiusToken="md" />
        </View>
      ) : isError ? (
        <ErrorState
          title={errorCopy(error).title}
          description={errorCopy(error).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t('empty.notificationsTitle')}
          description={t('empty.notificationsBody')}
        />
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => {
            const unread = notification.readAt === null;
            const title = t(notification.titleKey, notification.data);

            return (
              <Card
                key={notification.id}
                variant={unread ? 'raised' : 'flat'}
                style={styles.row}
                accessibilityLabel={unread ? `${t('notification.unread')}. ${title}` : title}
                onPress={() => {
                  open(notification);
                }}
              >
                <View style={[styles.iconWell, { backgroundColor: theme.colors.muted }]}>
                  <Icon
                    name={ICONS[notification.type]}
                    size={18}
                    color={unread ? theme.colors.primary : theme.colors.mutedForeground}
                  />
                </View>

                <View style={styles.body}>
                  <Text variant="title" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {t(notification.bodyKey, notification.data)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatShortDate(notification.createdAt, locale)}
                  </Text>
                </View>

                {unread ? (
                  <View
                    accessibilityElementsHidden
                    style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]}
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
