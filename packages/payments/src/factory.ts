import { MockPaymentProvider } from './providers/mock/mock-payment';
import { MockPrintProvider } from './providers/mock/mock-print';
import { MockSubscriptionProvider } from './providers/mock/mock-subscription';
import { IyzicoPaymentProvider } from './providers/iyzico/iyzico';
import { RevenueCatSubscriptionProvider } from './providers/revenuecat/revenuecat';
import type { PaymentProvider, PrintProvider, SubscriptionProvider } from './types';

export interface CommerceProviderConfig {
  isProduction: boolean;
  /** Injected so the mock subscription provider does not read the wall clock. */
  now: () => Date;

  paymentProvider: string;
  iyzicoApiKey?: string | undefined;
  iyzicoSecretKey?: string | undefined;
  iyzicoBaseUrl?: string | undefined;

  subscriptionProvider: string;
  revenueCatApiKey?: string | undefined;
  revenueCatWebhookSecret?: string | undefined;
  revenueCatEntitlementId?: string | undefined;

  printProvider: string;
}

/**
 * A mock must never be reachable in production.
 *
 * The environment schema already refuses to boot with `mock` under
 * `APP_ENV=production`, but a second check here means the guarantee survives a
 * future code path that constructs a provider without going through config —
 * the failure mode being guarded against is a real customer's card silently not
 * being charged (master prompt §64).
 */
function assertNotMockInProduction(kind: string, name: string, isProduction: boolean): void {
  if (isProduction && name === 'mock') {
    throw new Error(
      `The mock ${kind} provider cannot be used in production. Configure a real provider.`,
    );
  }
}

export function createPaymentProvider(config: CommerceProviderConfig): PaymentProvider {
  assertNotMockInProduction('payment', config.paymentProvider, config.isProduction);

  if (config.paymentProvider === 'iyzico') {
    if (!config.iyzicoApiKey || !config.iyzicoSecretKey) {
      throw new Error('IYZICO_API_KEY and IYZICO_SECRET_KEY are required for iyzico');
    }
    return new IyzicoPaymentProvider({
      apiKey: config.iyzicoApiKey,
      secretKey: config.iyzicoSecretKey,
      baseUrl: config.iyzicoBaseUrl ?? 'https://sandbox-api.iyzipay.com',
    });
  }

  return new MockPaymentProvider();
}

export function createSubscriptionProvider(
  config: CommerceProviderConfig,
): SubscriptionProvider {
  assertNotMockInProduction('subscription', config.subscriptionProvider, config.isProduction);

  if (config.subscriptionProvider === 'revenuecat') {
    if (!config.revenueCatApiKey || !config.revenueCatWebhookSecret) {
      throw new Error(
        'REVENUECAT_API_KEY and REVENUECAT_WEBHOOK_SECRET are required for revenuecat',
      );
    }
    return new RevenueCatSubscriptionProvider({
      apiKey: config.revenueCatApiKey,
      webhookSecret: config.revenueCatWebhookSecret,
      entitlementId: config.revenueCatEntitlementId ?? 'premium',
    });
  }

  return new MockSubscriptionProvider(config.now);
}

/**
 * The print provider is mock-only for now.
 *
 * No print house has been contracted, and inventing an adapter for one would be
 * worse than shipping the interface: the mock walks the full order lifecycle, so
 * dropping in a real adapter later touches this function and nothing else.
 */
export function createPrintProvider(config: CommerceProviderConfig): PrintProvider {
  if (config.printProvider !== 'mock') {
    throw new Error(
      `Unknown print provider "${config.printProvider}". Only "mock" ships today; add an adapter in packages/payments/src/providers.`,
    );
  }
  return new MockPrintProvider();
}
