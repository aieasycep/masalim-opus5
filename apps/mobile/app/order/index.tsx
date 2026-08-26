import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
} from '@masalim/ui';
import { useOrders } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';
import { formatMoney, formatShortDate } from '../../src/lib/format';
import { ORDER_STATUS_KEYS, ORDER_STATUS_TONES } from '../../src/lib/orders';

/**
 * Order history.
 *
 * The status badge carries the tone rather than the row, because a cancelled
 * order is still a record worth reading and colouring the whole row red would
 * make the list look like a wall of failures.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, errorCopy } = useI18n();

  const { data, isPending, isError, error, refetch } = useOrders();
  const orders = data?.items ?? [];

  return (
    <Screen>
      <ScreenHeader
        title={t('order.listTitle')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending ? (
        <View style={styles.list}>
          <Skeleton height={92} radiusToken="md" />
          <Skeleton height={92} radiusToken="md" />
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
      ) : orders.length === 0 ? (
        <EmptyState
          icon="truck"
          title={t('empty.ordersTitle')}
          description={t('empty.ordersBody')}
          actionLabel={t('empty.booksCta')}
          onAction={() => {
            router.replace('/(tabs)/library');
          }}
        />
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <Card
              key={order.id}
              style={styles.row}
              onPress={() => {
                router.push({ pathname: '/order/[id]', params: { id: order.id } });
              }}
              accessibilityRole="button"
              accessibilityLabel={order.bookTitle}
            >
              {order.coverImageUrl ? (
                <Image
                  source={{ uri: order.coverImageUrl }}
                  style={[styles.cover, { borderRadius: theme.radius.sm }]}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.cover,
                    styles.coverFallback,
                    { backgroundColor: theme.colors.muted, borderRadius: theme.radius.sm },
                  ]}
                >
                  <Icon name="book" size={20} color={theme.colors.mutedForeground} />
                </View>
              )}

              <View style={styles.rowBody}>
                <Text variant="title" numberOfLines={1}>
                  {order.bookTitle}
                </Text>
                <Text variant="caption" tone="muted">
                  {`${order.orderNumber} · ${formatShortDate(order.createdAt, locale)}`}
                </Text>
                <Badge
                  label={t(ORDER_STATUS_KEYS[order.status])}
                  tone={ORDER_STATUS_TONES[order.status]}
                />
              </View>

              <Text variant="title">{formatMoney(order.total)}</Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cover: { width: 56, height: 56 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
});
