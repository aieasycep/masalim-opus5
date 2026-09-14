import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  LoadingState,
  ProgressBar,
  Screen,
  Text,
  useTheme,
  useToast,
} from '@masalim/ui';
import {
  ANALYTICS_EVENTS,
  ENTITLEMENTS,
  ENTITLEMENT_KEYS,
  QUOTA_KEYS,
  type QuotaKey,
} from '@masalim/types';
import { useEntitlements, useRefreshSubscription } from '../../src/hooks/queries';
import { analytics } from '../../src/lib/analytics';
import { useI18n } from '../../src/i18n';

const USAGE_LABELS: Readonly<Record<QuotaKey, string>> = {
  [ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT]: 'subscription.usageStories',
  [ENTITLEMENT_KEYS.NARRATION_MONTHLY_LIMIT]: 'subscription.usageNarrations',
  [ENTITLEMENT_KEYS.ILLUSTRATION_MONTHLY_LIMIT]: 'subscription.usageIllustrations',
};

/**
 * The paywall.
 *
 * It opens with what the parent has already used this month, from the server's
 * own counters, before it says a word about Premium. Someone who has hit a limit
 * arrived here knowing it; showing them the number they hit — and when it resets
 * — respects that, where leading with a price does not.
 *
 * The feature list is generated from the real entitlement tables rather than
 * written out, so a limit changed on the server cannot leave the paywall
 * advertising a number the backend will not honour.
 *
 * On purchasing: RevenueCat's SDK is deliberately not part of this build. The
 * store transaction happens outside the app, and this screen's job afterwards is
 * to re-read entitlements — which is what the button does. Wiring the SDK is the
 * one remaining step, documented in docs/providers.md.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { t, errorCopy } = useI18n();

  const { data: entitlements, isPending } = useEntitlements();
  const refresh = useRefreshSubscription();

  // No source property: every caller opens this screen with a bare
  // `router.push('/subscription')` and passes nothing, so which locked feature
  // sent the parent here is not knowable from inside it.
  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.PAYWALL_VIEWED);
  }, []);

  const premium = ENTITLEMENTS.PREMIUM;
  const isPremium = entitlements?.tier === 'PREMIUM';

  const features: Array<{ key: string; label: string }> = [
    {
      key: 'stories',
      label: t('subscription.featureStories', {
        count: premium[ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT],
      }),
    },
    {
      key: 'illustrations',
      label: t('subscription.featureIllustrations', {
        count: premium[ENTITLEMENT_KEYS.ILLUSTRATION_MONTHLY_LIMIT],
      }),
    },
    { key: 'parentVoice', label: t('subscription.featureParentVoice') },
    { key: 'premiumVoices', label: t('subscription.featurePremiumVoices') },
    { key: 'hdBook', label: t('subscription.featureHdBook') },
    {
      key: 'discount',
      label: t('subscription.featureBookDiscount', {
        percent: premium[ENTITLEMENT_KEYS.PHYSICAL_BOOK_DISCOUNT_PERCENT],
      }),
    },
  ];

  return (
    <Screen footerHeight={140}>
      <View style={styles.closeRow}>
        <IconButton
          name="close"
          accessibilityLabel={t('common.close')}
          onPress={() => {
            router.back();
          }}
        />
      </View>

      <LinearGradient
        colors={[...theme.gradients.hero.colors]}
        locations={[...theme.gradients.hero.locations]}
        start={theme.gradients.hero.start}
        end={theme.gradients.hero.end}
        style={[styles.hero, { borderRadius: theme.radius.xl }]}
      >
        <Text variant="h3" align="center" style={{ color: theme.palette.cream }}>
          {t('subscription.title')}
        </Text>
        <Text variant="body" align="center" style={[styles.heroBody, { color: theme.palette.lavenderLight }]}>
          {t('subscription.subtitle')}
        </Text>
        {isPremium ? <Badge label={t('subscription.memberBadge')} tone="premium" /> : null}
      </LinearGradient>

      {/* What the server says has been used, before anything is sold. */}
      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : entitlements ? (
        <Card style={styles.usage}>
          {QUOTA_KEYS.map((quota) => {
            const counter = entitlements.usage[quota];
            return (
              <View key={quota} style={styles.usageRow}>
                <View style={styles.usageHeader}>
                  <Text variant="small" tone="muted">
                    {t(USAGE_LABELS[quota])}
                  </Text>
                  <Text variant="smallBold">{`${String(counter.used)} / ${String(counter.limit)}`}</Text>
                </View>
                <ProgressBar
                  value={counter.limit > 0 ? counter.used / counter.limit : 0}
                  height={6}
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <Text variant="smallBold" tone="muted" style={styles.sectionLabel}>
        {t('subscription.premiumTier')}
      </Text>

      <Card style={styles.features}>
        {features.map((feature) => (
          <View key={feature.key} style={styles.feature}>
            <Icon name="check" size={16} color={theme.colors.success} />
            <Text variant="small" style={styles.featureLabel}>
              {feature.label}
            </Text>
          </View>
        ))}
      </Card>

      {isPremium ? (
        <Button
          label={t('subscription.manage')}
          style={styles.cta}
          onPress={() => {
            router.push('/subscription/manage');
          }}
        />
      ) : (
        <>
          <Button
            label={t('subscription.subscribe')}
            loading={refresh.isPending}
            style={styles.cta}
            onPress={() => {
              const wasPremium = isPremium;
              refresh.mutate(undefined, {
                onSuccess: (subscription) => {
                  // The store transaction happens outside the app, so a start is
                  // only real once the re-read comes back Premium *and* the
                  // account was not already Premium going in. Without that second
                  // half, an existing member re-emits a start every time they tap.
                  if (subscription.tier !== 'PREMIUM' || wasPremium) return;
                  analytics.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
                    status: subscription.status,
                    product_id: subscription.productId,
                    in_trial: subscription.trialEndsAt !== null,
                    will_renew: subscription.willRenew,
                  });
                },
                onError: (cause) => {
                  toast.show({ message: errorCopy(cause).message, tone: 'error' });
                },
              });
            }}
          />
          <Text variant="caption" tone="muted" align="center" style={styles.trial}>
            {t('subscription.trialNote')}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeRow: { alignItems: 'flex-end', marginBottom: 4 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 24 },
  heroBody: { marginBottom: 4 },
  usage: { gap: 14, marginTop: 24 },
  usageRow: { gap: 6 },
  usageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { marginTop: 24, marginBottom: 10 },
  features: { gap: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureLabel: { flex: 1 },
  cta: { marginTop: 24 },
  trial: { marginTop: 10 },
});
