import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useCancelOrder, useOrder } from '../../src/hooks/queries';
import { useOrderDraft } from '../../src/stores/order-draft';
import { useI18n } from '../../src/i18n';
import { formatMoney, formatShortDate } from '../../src/lib/format';
import {
  ORDER_STATUS_KEYS,
  ORDER_STATUS_TONES,
  ORDER_TIMELINE,
  isCancellable,
} from '../../src/lib/orders';

/**
 * One order, in full.
 *
 * The timeline is drawn from the order's own recorded events rather than
 * inferred from its current status, so a book that skipped or repeated a step
 * shows what actually happened. Steps with no event are drawn as not-yet-reached
 * instead of being hidden — a parent watching for "Kargoda" wants to see that it
 * is still ahead.
 *
 * Everything shown is the frozen snapshot the order was placed with. Editing the
 * book afterwards cannot change it, which is the point of taking the snapshot at
 * all (§80).
 */
export default function OrderDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, locale, errorCopy } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: order, isPending, isError, error, refetch } = useOrder(id ?? null);
  const cancelOrder = useCancelOrder();
  const updateDraft = useOrderDraft((state) => state.update);

  const [confirming, setConfirming] = useState(false);

  if (isPending) {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  if (isError || !order) {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <ErrorState
          title={errorCopy(error).title}
          description={errorCopy(error).message}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
        />
      </Screen>
    );
  }

  const reached = new Set(order.events.map((event) => event.type));
  const occurredAt = (status: string): string | null =>
    order.events.find((event) => event.type === status)?.occurredAt ?? null;

  const unpaid = order.status === 'PENDING_PAYMENT';

  return (
    <Screen footerHeight={unpaid ? 150 : 100}>
      <ScreenHeader
        title={order.orderNumber}
        onBack={() => {
          router.back();
        }}
      />

      <View style={styles.statusRow}>
        <Badge label={t(ORDER_STATUS_KEYS[order.status])} tone={ORDER_STATUS_TONES[order.status]} />
        <Text variant="caption" tone="muted">
          {formatShortDate(order.createdAt, locale)}
        </Text>
      </View>

      <Text variant="h4" style={styles.bookTitle}>
        {order.bookTitle}
      </Text>

      {/* Real events, not a status-derived guess. */}
      <Card style={styles.block}>
        {ORDER_TIMELINE.map((step) => {
          const done = reached.has(step) || step === order.status;
          const at = occurredAt(step);

          return (
            <View key={step} style={styles.step}>
              <Icon
                name={done ? 'check' : 'clock'}
                size={16}
                color={done ? theme.colors.success : theme.colors.mutedForeground}
              />
              <Text variant="small" tone={done ? 'default' : 'muted'} style={styles.stepLabel}>
                {t(ORDER_STATUS_KEYS[step])}
              </Text>
              {at ? (
                <Text variant="caption" tone="muted">
                  {formatShortDate(at, locale)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      {order.trackingNumber ? (
        <Card style={styles.block}>
          <Text variant="caption" tone="muted">
            {t('order.trackingNumber')}
          </Text>
          <Text variant="title" selectable>
            {order.trackingNumber}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <Text variant="smallBold" tone="muted">
          {t('order.addressTitle')}
        </Text>
        <Text variant="small">{order.shippingAddress.fullName}</Text>
        <Text variant="small" tone="muted">
          {`${order.shippingAddress.line1}${
            order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''
          }`}
        </Text>
        <Text variant="small" tone="muted">
          {`${order.shippingAddress.postalCode} ${order.shippingAddress.district} / ${order.shippingAddress.city}`}
        </Text>
      </Card>

      <Card style={styles.block}>
        <View style={styles.row}>
          <Text variant="small" tone="muted">
            {t('order.quantity')}
          </Text>
          <Text variant="small">{String(order.quantity)}</Text>
        </View>
        <View style={styles.row}>
          <Text variant="small" tone="muted">
            {t('order.subtotal')}
          </Text>
          <Text variant="small">{formatMoney(order.subtotal)}</Text>
        </View>
        {Number(order.discount.amount) > 0 ? (
          <View style={styles.row}>
            <Text variant="small" tone="muted">
              {t('order.discount')}
            </Text>
            <Text variant="small">{`−${formatMoney(order.discount)}`}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text variant="small" tone="muted">
            {t('order.shipping')}
          </Text>
          <Text variant="small">
            {Number(order.shipping.amount) === 0
              ? t('order.shippingFree')
              : formatMoney(order.shipping)}
          </Text>
        </View>

        <Divider spacing={12} />

        <View style={styles.row}>
          <Text variant="title">{t('order.total')}</Text>
          <Text variant="h5">{formatMoney(order.total)}</Text>
        </View>
      </Card>

      {/* An unpaid order is finishable, not stuck. */}
      {unpaid ? (
        <Button
          label={t('order.pay')}
          style={styles.action}
          onPress={() => {
            updateDraft({ orderId: order.id });
            router.push('/order/payment');
          }}
        />
      ) : null}

      {isCancellable(order.status) ? (
        <Button
          label={t('common.cancel')}
          variant="tertiary"
          onPress={() => {
            setConfirming(true);
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title={t('common.cancel')}
        message={t('order.statusCancelled')}
        confirmLabel={t('common.cancel')}
        cancelLabel={t('common.back')}
        tone="destructive"
        loading={cancelOrder.isPending}
        onConfirm={() => {
          cancelOrder.mutate(order.id, {
            onSuccess: () => {
              setConfirming(false);
            },
            onError: (cause) => {
              setConfirming(false);
              toast.show({ message: errorCopy(cause).message, tone: 'error' });
            },
          });
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  bookTitle: { marginTop: 12, marginBottom: 20 },
  block: { gap: 8, marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { marginTop: 12 },
});
