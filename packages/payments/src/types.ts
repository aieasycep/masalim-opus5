import type { Currency, SubscriptionStatus, SubscriptionStore } from '@masalim/types';

/** Failures a provider can raise, mapped to domain error codes by the caller. */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'declined' | 'invalid_request' | 'unauthorized' | 'unavailable' | 'unknown',
    options: { cause?: unknown; providerCode?: string } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'PaymentProviderError';
    this.providerCode = options.providerCode;
  }

  readonly providerCode: string | undefined;
}

// ------------------------------------------------------------- Payments

export interface PaymentBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  phone: string;
  /** Registration address, required by Turkish payment regulation. */
  addressLine: string;
  city: string;
  country: string;
  ipAddress: string;
}

export interface PaymentBasketItem {
  id: string;
  name: string;
  /** Decimal string in major units. */
  price: string;
}

export interface InitiatePaymentInput {
  orderId: string;
  orderNumber: string;
  /** Decimal string in major units; the provider is never told a float. */
  amount: string;
  currency: Currency;
  buyer: PaymentBuyer;
  shippingAddressLine: string;
  shippingCity: string;
  basket: PaymentBasketItem[];
  /** Where the provider returns the customer after 3D Secure. */
  callbackUrl: string;
  /** Same key as the order, so a retried request cannot charge twice. */
  idempotencyKey: string;
}

export interface InitiatedPayment {
  providerPaymentId: string;
  /**
   * What the app must show to complete the payment. Turkish 3D Secure returns
   * an HTML form that has to be posted from a web view.
   */
  checkout:
    | { kind: 'redirect'; url: string }
    | { kind: 'html_form'; html: string }
    | { kind: 'none' };
  /** Provider response with card data and secrets already removed. */
  redactedPayload: Record<string, unknown>;
}

export interface PaymentVerification {
  status: 'succeeded' | 'failed' | 'pending';
  providerPaymentId: string;
  /** Present when the payment failed; never shown to the customer verbatim. */
  providerErrorCode?: string;
  redactedPayload: Record<string, unknown>;
}

export interface RefundInput {
  providerPaymentId: string;
  amount: string;
  currency: Currency;
  idempotencyKey: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiatePaymentInput): Promise<InitiatedPayment>;
  /** Called from the provider callback and again from the client, idempotently. */
  verify(orderId: string, providerPaymentId: string): Promise<PaymentVerification>;
  refund(input: RefundInput): Promise<{ refunded: boolean; redactedPayload: Record<string, unknown> }>;
}

// -------------------------------------------------------- Subscriptions

export interface SubscriptionState {
  status: SubscriptionStatus;
  store: SubscriptionStore;
  productId: string | null;
  entitlement: string;
  originalTransactionId: string | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  trialEndsAt: Date | null;
  willRenew: boolean;
}

export interface SubscriptionWebhookEvent {
  /** Provider event id, so a replayed webhook is ignored. */
  eventId: string;
  type: string;
  userId: string;
  state: SubscriptionState;
  redactedPayload: Record<string, unknown>;
}

export interface SubscriptionProvider {
  readonly name: string;
  /** Authoritative read, used when the client claims an entitlement changed. */
  fetchState(userId: string): Promise<SubscriptionState>;
  /**
   * Verifies a webhook's authenticity and normalises it.
   *
   * Returns null when the signature does not check out, so an unauthenticated
   * request can never grant somebody a subscription.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): SubscriptionWebhookEvent | null;
}

// --------------------------------------------------------------- Print

export interface PrintOrderItem {
  /** Signed URL or storage key the printer can fetch the PDF from. */
  fileUrl: string;
  quantity: number;
  bookSize: string;
  coverType: string;
  pageCount: number;
}

export interface PrintOrderInput {
  orderNumber: string;
  item: PrintOrderItem;
  recipient: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    district: string;
    city: string;
    postalCode: string;
    countryCode: string;
  };
  idempotencyKey: string;
}

export interface PrintOrderStatus {
  providerOrderId: string;
  status: 'received' | 'in_production' | 'shipped' | 'delivered' | 'cancelled' | 'failed';
  trackingNumber: string | null;
}

export interface PrintProvider {
  readonly name: string;
  submit(input: PrintOrderInput): Promise<PrintOrderStatus>;
  getStatus(providerOrderId: string): Promise<PrintOrderStatus>;
  cancel(providerOrderId: string): Promise<boolean>;
}
