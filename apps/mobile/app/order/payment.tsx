import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Button, Card, Icon, LoadingState, Screen, ScreenHeader, Text, useTheme } from '@masalim/ui';
import { isApiError } from '@masalim/api-client';
import { ANALYTICS_EVENTS, type PaymentInitiationDto } from '@masalim/types';
import { useInitiatePayment, useVerifyPayment } from '../../src/hooks/queries';
import { analytics } from '../../src/lib/analytics';
import { useOrderDraft } from '../../src/stores/order-draft';
import { useI18n } from '../../src/i18n';

/**
 * Where the bank takes over.
 *
 * The URL the provider returns to once 3-D Secure finishes. It is only a signal
 * that the flow ended — never evidence of what happened, since anyone can open
 * it. Reaching it makes the app *ask* the server, which re-checks with the
 * provider and answers authoritatively.
 */
const RETURN_URL = 'https://masalim.app/payments/return';

export default function OrderPaymentScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();

  const draft = useOrderDraft((state) => state.draft);
  const resetDraft = useOrderDraft((state) => state.reset);
  const initiate = useInitiatePayment();
  const verify = useVerifyPayment();

  const [checkout, setCheckout] = useState<PaymentInitiationDto | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderId = draft.orderId;

  useEffect(() => {
    if (!orderId || checkout || initiate.isPending) return;

    initiate.mutate(
      { orderId, returnUrl: RETURN_URL, idempotencyKey: Crypto.randomUUID() },
      {
        onSuccess: (initiation) => {
          setCheckout(initiation);

          // A provider that needs no interaction — a saved card, or the mock in
          // development — settles immediately rather than showing an empty view.
          if (initiation.checkout.kind === 'none') {
            void confirm(initiation.providerPaymentId);
          }
        },
        onError: (cause) => {
          analytics.capture(ANALYTICS_EVENTS.PURCHASE_FAILED, {
            stage: 'initiate',
            error_code: isApiError(cause) ? cause.code : null,
          });
          setError(errorCopy(cause).message);
        },
      },
    );
    // `confirm` is stable for the life of this screen; re-running on its identity
    // would restart the payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const confirm = async (providerPaymentId: string): Promise<void> => {
    if (!orderId) return;

    setVerifying(true);
    setError(null);

    try {
      const { status } = await verify.mutateAsync({ orderId, providerPaymentId });

      if (status === 'PAID' || status === 'AUTHORIZED') {
        resetDraft();
        router.replace({ pathname: '/order/success/[id]', params: { id: orderId } });
        return;
      }

      // Declined. The order survives unpaid, so paying again is one tap from
      // its detail screen rather than a rebuilt basket.
      analytics.capture(ANALYTICS_EVENTS.PURCHASE_FAILED, {
        stage: 'verify',
        error_code: 'PAYMENT_FAILED',
        payment_status: status,
      });
      setError(errorCopy({ name: 'ApiError', code: 'PAYMENT_FAILED' }).message);
    } catch (cause) {
      analytics.capture(ANALYTICS_EVENTS.PURCHASE_FAILED, {
        stage: 'verify',
        error_code: isApiError(cause) ? cause.code : null,
      });
      setError(errorCopy(cause).message);
    } finally {
      setVerifying(false);
    }
  };

  /** The provider has come back; ask the server what actually happened. */
  const onNavigation = (event: WebViewNavigation): void => {
    if (!event.url.startsWith(RETURN_URL) || !checkout) return;
    void confirm(checkout.providerPaymentId);
  };

  if (!orderId) {
    return (
      <Screen>
        <ScreenHeader
          onBack={() => {
            router.back();
          }}
        />
        <Card style={styles.notice}>
          <Icon name="alert" size={18} color={theme.colors.destructive} />
          <Text variant="small" tone="muted" style={styles.noticeText}>
            {errorCopy(null).message}
          </Text>
          <Button
            label={t('common.back')}
            variant="tertiary"
            fullWidth={false}
            onPress={() => {
              router.replace('/order');
            }}
          />
        </Card>
      </Screen>
    );
  }

  const interactive =
    checkout && (checkout.checkout.kind === 'redirect' || checkout.checkout.kind === 'html_form');

  return (
    <Screen scroll={false} edgeToEdge={interactive === true}>
      <View style={styles.header}>
        <ScreenHeader
          title={t('order.pay')}
          onBack={() => {
            router.back();
          }}
        />
      </View>

      {error ? (
        <Card style={styles.notice}>
          <Icon name="alert" size={18} color={theme.colors.destructive} />
          <Text variant="small" tone="muted" style={styles.noticeText} accessibilityLiveRegion="polite">
            {error}
          </Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setError(null);
              setCheckout(null);
            }}
          />
        </Card>
      ) : verifying || initiate.isPending || !checkout ? (
        <LoadingState label={t('common.loading')} />
      ) : checkout.checkout.kind === 'redirect' ? (
        <WebView
          source={{ uri: checkout.checkout.url }}
          onNavigationStateChange={onNavigation}
          style={styles.web}
        />
      ) : checkout.checkout.kind === 'html_form' ? (
        // Turkish acquirers hand back a self-submitting form, not a URL.
        <WebView
          source={{ html: checkout.checkout.html, baseUrl: RETURN_URL }}
          onNavigationStateChange={onNavigation}
          style={styles.web}
        />
      ) : (
        <LoadingState label={t('common.loading')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24 },
  web: { flex: 1 },
  notice: { alignItems: 'center', gap: 12, marginHorizontal: 24, marginTop: 32 },
  noticeText: { textAlign: 'center' },
});
