import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  Divider,
  IconButton,
  LoadingState,
  OptionCard,
  Screen,
  ScreenHeader,
  Text,
} from '@masalim/ui';
import { BOOK_SIZES, COVER_TYPES, type BookSize, type CoverType } from '@masalim/types';
import { usePriceQuote, usePrintProducts } from '../../../src/hooks/queries';
import { useOrderDraft } from '../../../src/stores/order-draft';
import { useI18n } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';

const MAX_QUANTITY = 10;

const SIZE_KEYS: Readonly<Record<BookSize, string>> = {
  SQUARE: 'order.sizeSquare',
  STANDARD: 'order.sizeStandard',
};

const COVER_KEYS: Readonly<Record<CoverType, string>> = {
  HARDCOVER: 'order.coverHard',
  SOFTCOVER: 'order.coverSoft',
};

/**
 * Choosing the physical book.
 *
 * Every change re-asks the server for a price. That is a request per tap, and it
 * is the right trade: the figure a parent sees here is the figure they will be
 * charged, because it is the same calculation, not a client-side reconstruction
 * of it. Nothing on this screen multiplies a unit price by a quantity (§82).
 *
 * The catalogue's per-format "from" prices come from `usePrintProducts` so the
 * options can be compared before committing to a quote.
 */
export default function ConfigureOrderScreen() {
  const router = useRouter();
  const { t, errorCopy } = useI18n();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const draft = useOrderDraft((state) => state.draft);
  const update = useOrderDraft((state) => state.update);
  const { data: products = [], isPending: productsPending } = usePrintProducts();

  useEffect(() => {
    if (bookId && draft.bookId !== bookId) {
      update({ bookId });
    }
  }, [bookId, draft.bookId, update]);

  const quoteInput =
    draft.bookId !== null
      ? {
          bookId: draft.bookId,
          bookSize: draft.bookSize,
          coverType: draft.coverType,
          quantity: draft.quantity,
        }
      : null;

  const { data: quote, isPending: quotePending, isError, error } = usePriceQuote(quoteInput);

  /** The catalogue's starting price for a format, shown as decision support. */
  const startingPrice = (bookSize: BookSize, coverType: CoverType): string | undefined => {
    const product = products.find(
      (candidate) => candidate.bookSize === bookSize && candidate.coverType === coverType,
    );
    return product ? formatMoney(product.basePrice) : undefined;
  };

  if (productsPending) {
    return (
      <Screen>
        <ScreenHeader
          title={t('order.configureTitle')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen footerHeight={190}>
      <ScreenHeader
        title={t('order.configureTitle')}
        onBack={() => {
          router.back();
        }}
      />

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('order.size')}
      </Text>
      {BOOK_SIZES.map((size) => (
        <OptionCard
          key={size}
          title={t(SIZE_KEYS[size])}
          selected={draft.bookSize === size}
          style={styles.option}
          {...(() => {
            const price = startingPrice(size, draft.coverType);
            return price ? { meta: price } : {};
          })()}
          onPress={() => {
            update({ bookSize: size });
          }}
        />
      ))}

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('order.cover')}
      </Text>
      {COVER_TYPES.map((cover) => (
        <OptionCard
          key={cover}
          title={t(COVER_KEYS[cover])}
          selected={draft.coverType === cover}
          style={styles.option}
          {...(() => {
            const price = startingPrice(draft.bookSize, cover);
            return price ? { meta: price } : {};
          })()}
          onPress={() => {
            update({ coverType: cover });
          }}
        />
      ))}

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('order.quantity')}
      </Text>
      <Card style={styles.quantityCard}>
        <IconButton
          name="minus"
          accessibilityLabel={t('order.quantity')}
          variant="surface"
          disabled={draft.quantity <= 1}
          onPress={() => {
            update({ quantity: Math.max(1, draft.quantity - 1) });
          }}
        />
        <Text variant="h5" accessibilityLiveRegion="polite">
          {String(draft.quantity)}
        </Text>
        <IconButton
          name="plus"
          accessibilityLabel={t('order.quantity')}
          variant="surface"
          disabled={draft.quantity >= MAX_QUANTITY}
          onPress={() => {
            update({ quantity: Math.min(MAX_QUANTITY, draft.quantity + 1) });
          }}
        />
      </Card>

      {/* The server's figure, refreshed on every change — never recomputed here. */}
      <Card style={styles.summary}>
        {quotePending ? (
          <LoadingState label={t('common.loading')} />
        ) : isError ? (
          <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
            {errorCopy(error).message}
          </Text>
        ) : quote ? (
          <>
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
            <Divider spacing={12} />
            <View style={styles.row}>
              <Text variant="title">{t('order.total')}</Text>
              <Text variant="h5">{formatMoney(quote.total)}</Text>
            </View>
          </>
        ) : null}
      </Card>

      <Button
        label={t('common.continue')}
        disabled={!quote}
        style={styles.cta}
        onPress={() => {
          router.push('/order/address');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: 20, marginBottom: 10 },
  option: { marginBottom: 10 },
  quantityCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cta: { marginTop: 24 },
});
