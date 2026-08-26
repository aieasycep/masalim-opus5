import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import {
  Button,
  Card,
  Divider,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { useAddresses, useCreateOrder, usePriceQuote } from '../../src/hooks/queries';
import { useOrderDraft } from '../../src/stores/order-draft';
import { useI18n } from '../../src/i18n';
import { formatMoney } from '../../src/lib/format';

/**
 * The last screen before money moves.
 *
 * Every figure here is read straight off the server's quote. There is no
 * arithmetic on this screen at all — not even summing the lines — because the
 * moment the client can compute a total, the total on screen and the total
 * charged are two different numbers maintained in two places (§82).
 *
 * The idempotency key is minted once and kept in the draft. A parent on a
 * flaky connection who taps "Ödemeyi Tamamla" twice gets one order back, not
 * two printed books.
 */
export default function OrderReviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();

  const draft = useOrderDraft((state) => state.draft);
  const update = useOrderDraft((state) => state.update);
  const createOrder = useCreateOrder();
  const { data: addresses = [] } = useAddresses();

  const [error, setError] = useState<string | null>(null);

  const address = addresses.find((candidate) => candidate.id === draft.addressId) ?? null;

  const quoteInput =
    draft.bookId !== null && draft.addressId !== null
      ? {
          bookId: draft.bookId,
          bookSize: draft.bookSize,
          coverType: draft.coverType,
          quantity: draft.quantity,
          addressId: draft.addressId,
        }
      : null;

  const { data: quote, isPending, isError, error: quoteError, refetch } = usePriceQuote(quoteInput);

  const place = (): void => {
    if (!draft.bookId || !draft.addressId) return;

    // Minted once, reused by every retry.
    const idempotencyKey = draft.idempotencyKey ?? Crypto.randomUUID();
    update({ idempotencyKey });
    setError(null);

    createOrder.mutate(
      {
        bookId: draft.bookId,
        bookSize: draft.bookSize,
        coverType: draft.coverType,
        quantity: draft.quantity,
        addressId: draft.addressId,
        idempotencyKey,
      },
      {
        onSuccess: (order) => {
          update({ orderId: order.id });
          router.push('/order/payment');
        },
        onError: (cause) => {
          setError(errorCopy(cause).message);
        },
      },
    );
  };

  const lines: Array<{ labelKey: string; value: string; muted?: boolean }> = quote
    ? [
        { labelKey: 'order.subtotal', value: formatMoney(quote.subtotal) },
        ...(Number(quote.discount.amount) > 0
          ? [{ labelKey: 'order.discount', value: `−${formatMoney(quote.discount)}` }]
          : []),
        {
          labelKey: 'order.shipping',
          value:
            Number(quote.shipping.amount) === 0
              ? t('order.shippingFree')
              : formatMoney(quote.shipping),
        },
      ]
    : [];

  return (
    <Screen footerHeight={150}>
      <ScreenHeader
        title={t('order.reviewTitle')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : isError || !quote ? (
        <Card style={styles.error}>
          <Icon name="alert" size={18} color={theme.colors.destructive} />
          <Text variant="small" tone="muted" style={styles.errorText}>
            {errorCopy(quoteError).message}
          </Text>
          <Button
            label={t('common.retry')}
            variant="tertiary"
            size="small"
            fullWidth={false}
            onPress={() => {
              void refetch();
            }}
          />
        </Card>
      ) : (
        <>
          <Card style={styles.block}>
            <View style={styles.row}>
              <Text variant="small" tone="muted">
                {t('order.quantity')}
              </Text>
              <Text variant="small">{String(quote.quantity)}</Text>
            </View>
            <View style={styles.row}>
              <Text variant="small" tone="muted">
                {t('order.estimatedDelivery')}
              </Text>
              <Text variant="small">
                {t('order.deliveryDays', {
                  min: quote.estimatedDeliveryDays.min,
                  max: quote.estimatedDeliveryDays.max,
                })}
              </Text>
            </View>
          </Card>

          {address ? (
            <Card style={styles.block}>
              <Text variant="smallBold" tone="muted">
                {t('order.addressTitle')}
              </Text>
              <Text variant="small">{address.fullName}</Text>
              <Text variant="small" tone="muted">
                {`${address.line1}${address.line2 ? `, ${address.line2}` : ''}`}
              </Text>
              <Text variant="small" tone="muted">
                {`${address.postalCode} ${address.district} / ${address.city}`}
              </Text>
            </Card>
          ) : null}

          <Card style={styles.block}>
            {lines.map((line) => (
              <View key={line.labelKey} style={styles.row}>
                <Text variant="small" tone="muted">
                  {t(line.labelKey)}
                </Text>
                <Text variant="small">{line.value}</Text>
              </View>
            ))}

            <Divider spacing={12} />

            <View style={styles.row}>
              <Text variant="title">{t('order.total')}</Text>
              <Text variant="h5">{formatMoney(quote.total)}</Text>
            </View>
          </Card>

          <View style={styles.secure}>
            <Icon name="lock" size={14} color={theme.colors.mutedForeground} />
            <Text variant="caption" tone="muted" style={styles.secureText}>
              {t('order.paySecure')}
            </Text>
          </View>
        </>
      )}

      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        label={t('order.pay')}
        disabled={!quote}
        loading={createOrder.isPending}
        style={styles.cta}
        onPress={place}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { alignItems: 'center', gap: 10 },
  errorText: { textAlign: 'center' },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  secureText: { flex: 1 },
  cta: { marginTop: 20 },
});
