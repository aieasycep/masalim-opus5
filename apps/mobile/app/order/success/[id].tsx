import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Icon, LoadingState, Screen, Text, useTheme } from '@masalim/ui';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { useOrder } from '../../../src/hooks/queries';
import { analytics } from '../../../src/lib/analytics';
import { useI18n } from '../../../src/i18n';

/**
 * The order is placed.
 *
 * The order number is given prominence because it is the one thing a parent may
 * need to quote to support, and the estimated delivery because it is the
 * question they will ask next. Both come from the order itself rather than from
 * the draft — the draft describes what was requested, the order records what was
 * actually bought.
 */
export default function OrderSuccessScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: order, isPending } = useOrder(id ?? null);

  useEffect(() => {
    if (!order) return;

    // The order's own recorded total, only converted to kuruş for reporting —
    // the figure is the server's, never reassembled from lines here.
    const [whole = '0', fraction = ''] = order.total.amount.split('.');
    const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));

    analytics.capture(ANALYTICS_EVENTS.PURCHASE_COMPLETED, {
      amount_minor: amountMinor,
      currency: order.total.currency,
      quantity: order.quantity,
      book_size: order.bookSize,
      cover_type: order.coverType,
    });
    // Keyed on the order rather than the query result, which a refetch would
    // replace and re-report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (isPending || !order) {
    return (
      <Screen>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.body}>
        <View style={[styles.mark, { backgroundColor: theme.colors.secondary }]}>
          <Icon name="check" size={36} color={theme.colors.success} />
        </View>

        <Text variant="h4" align="center" style={styles.title}>
          {t('order.successTitle', { name: order.bookTitle })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t('order.successBody')}
        </Text>

        <Card style={styles.numberCard}>
          <Text variant="caption" tone="muted">
            {t('order.orderNumber')}
          </Text>
          <Text variant="h5" selectable>
            {order.orderNumber}
          </Text>
          <Text variant="caption" tone="muted">
            {t('order.deliveryDays', {
              min: order.estimatedDeliveryDays.min,
              max: order.estimatedDeliveryDays.max,
            })}
          </Text>
        </Card>

        <Button
          label={t('order.track')}
          style={styles.cta}
          onPress={() => {
            router.replace({ pathname: '/order/[id]', params: { id: order.id } });
          }}
        />

        <Button
          label={t('common.done')}
          variant="tertiary"
          onPress={() => {
            router.replace('/(tabs)');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { marginBottom: 4 },
  numberCard: { alignItems: 'center', gap: 6, marginTop: 28, alignSelf: 'stretch' },
  cta: { marginTop: 24, alignSelf: 'stretch' },
});
