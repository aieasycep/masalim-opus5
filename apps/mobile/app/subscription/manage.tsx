import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  Badge,
  Button,
  Card,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import { useRefreshSubscription, useSubscription } from '../../src/hooks/queries';
import { useI18n } from '../../src/i18n';
import { formatShortDate } from '../../src/lib/format';

/** Where a subscription is actually cancelled. The app cannot do it. */
const STORE_SUBSCRIPTION_URLS = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
};

/**
 * The current subscription.
 *
 * Cancelling is a link to the App Store or Play Store, not a button. Both
 * platforms own the billing relationship and neither exposes an API to cancel on
 * a user's behalf, so a "Cancel" button here could only pretend. Sending someone
 * to the place that can actually do it is the honest version, and it is also the
 * only one that works.
 *
 * "Restore purchases" is real: it re-reads entitlements from the server, which
 * is how a reinstall or a second device picks up an existing subscription.
 */
export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, locale, errorCopy } = useI18n();

  const { data: subscription, isPending } = useSubscription();
  const refresh = useRefreshSubscription();

  const openStore = (): void => {
    const url =
      subscription?.managementUrl ??
      (Platform.OS === 'ios' ? STORE_SUBSCRIPTION_URLS.ios : STORE_SUBSCRIPTION_URLS.android);
    void WebBrowser.openBrowserAsync(url);
  };

  if (isPending || !subscription) {
    return (
      <Screen>
        <ScreenHeader
          title={t('subscription.manage')}
          onBack={() => {
            router.back();
          }}
        />
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  const premium = subscription.tier === 'PREMIUM';

  return (
    <Screen>
      <ScreenHeader
        title={t('subscription.manage')}
        onBack={() => {
          router.back();
        }}
      />

      <Card style={styles.status}>
        <View style={styles.statusRow}>
          <Text variant="h5">
            {premium ? t('subscription.premiumTier') : t('subscription.freeTier')}
          </Text>
          {premium ? <Badge label={t('subscription.memberBadge')} tone="premium" /> : null}
        </View>

        {subscription.expiresAt ? (
          <Text variant="small" tone="muted">
            {t('subscription.activeUntil', {
              date: formatShortDate(subscription.expiresAt, locale),
            })}
          </Text>
        ) : null}
      </Card>

      {!premium ? (
        <Button
          label={t('subscription.subscribe')}
          style={styles.action}
          onPress={() => {
            router.replace('/subscription');
          }}
        />
      ) : null}

      <Button
        label={t('subscription.restore')}
        variant="secondary"
        loading={refresh.isPending}
        style={styles.action}
        onPress={() => {
          refresh.mutate(undefined, {
            onError: (cause) => {
              toast.show({ message: errorCopy(cause).message, tone: 'error' });
            },
          });
        }}
      />

      {/* The store, because that is where cancellation lives. */}
      {premium ? (
        <Card style={styles.cancelNote}>
          <Icon name="info" size={18} color={theme.colors.mutedForeground} />
          <View style={styles.cancelBody}>
            <Text variant="small" tone="muted">
              {t('subscription.trialNote')}
            </Text>
            <Text
              variant="smallBold"
              tone="primary"
              accessibilityRole="link"
              onPress={openStore}
              style={styles.cancelLink}
            >
              {t('subscription.manage')}
            </Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { gap: 10, marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { marginTop: 16 },
  cancelNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 },
  cancelBody: { flex: 1, gap: 8 },
  cancelLink: { paddingVertical: 4 },
});
