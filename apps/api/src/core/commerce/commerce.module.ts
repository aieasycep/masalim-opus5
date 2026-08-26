import { Global, Module } from '@nestjs/common';
import {
  createPaymentProvider,
  createPrintProvider,
  createSubscriptionProvider,
  type CommerceProviderConfig,
  type PaymentProvider,
  type PrintProvider,
  type SubscriptionProvider,
} from '@masalim/payments';
import { AppConfigService } from '../config/config.service';
import { Clock } from '../time/clock';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const SUBSCRIPTION_PROVIDER = Symbol('SUBSCRIPTION_PROVIDER');
export const PRINT_PROVIDER = Symbol('PRINT_PROVIDER');

function toProviderConfig(config: AppConfigService, clock: Clock): CommerceProviderConfig {
  return {
    isProduction: config.isProduction,
    now: () => clock.now(),
    paymentProvider: config.get('PAYMENT_PROVIDER'),
    iyzicoApiKey: config.get('IYZICO_API_KEY'),
    iyzicoSecretKey: config.get('IYZICO_SECRET_KEY'),
    iyzicoBaseUrl: config.get('IYZICO_BASE_URL'),
    subscriptionProvider: config.get('SUBSCRIPTION_PROVIDER'),
    revenueCatApiKey: config.get('REVENUECAT_SECRET_API_KEY'),
    revenueCatWebhookSecret: config.get('REVENUECAT_WEBHOOK_AUTH_HEADER'),
    revenueCatEntitlementId: config.get('REVENUECAT_ENTITLEMENT_ID'),
    printProvider: config.get('PRINT_PROVIDER'),
  };
}

/**
 * Commerce providers, resolved once at boot.
 *
 * Same reasoning as the AI providers: a missing iyzico secret should stop the
 * process starting, not surface as a failed checkout the first time somebody
 * tries to buy a book.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService, Clock],
      useFactory: (config: AppConfigService, clock: Clock): PaymentProvider =>
        createPaymentProvider(toProviderConfig(config, clock)),
    },
    {
      provide: SUBSCRIPTION_PROVIDER,
      inject: [AppConfigService, Clock],
      useFactory: (config: AppConfigService, clock: Clock): SubscriptionProvider =>
        createSubscriptionProvider(toProviderConfig(config, clock)),
    },
    {
      provide: PRINT_PROVIDER,
      inject: [AppConfigService, Clock],
      useFactory: (config: AppConfigService, clock: Clock): PrintProvider =>
        createPrintProvider(toProviderConfig(config, clock)),
    },
  ],
  exports: [PAYMENT_PROVIDER, SUBSCRIPTION_PROVIDER, PRINT_PROVIDER],
})
export class CommerceModule {}
