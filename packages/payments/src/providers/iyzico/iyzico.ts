import { createHmac, randomUUID } from 'node:crypto';
import type {
  InitiatePaymentInput,
  InitiatedPayment,
  PaymentProvider,
  PaymentVerification,
  RefundInput,
} from '../../types';
import { PaymentProviderError } from '../../types';

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  /** https://api.iyzipay.com in production, https://sandbox-api.iyzipay.com otherwise. */
  baseUrl: string;
}

interface IyzicoResponse {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  paymentId?: string;
  token?: string;
  threeDSHtmlContent?: string;
  paymentPageUrl?: string;
  paymentStatus?: string;
  conversationId?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * iyzico, Turkey's dominant card acquirer.
 *
 * Chosen because it is what Turkish customers expect at checkout: TRY, local
 * installment plans, and 3D Secure that actually works with Turkish issuers.
 *
 * Card data never reaches this process. The checkout-form flow hands the
 * customer to iyzico's own page and returns an HTML form to post from a web
 * view; what comes back here is a token and a payment id.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly name = 'iyzico';

  constructor(private readonly config: IyzicoConfig) {}

  async initiate(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    const conversationId = input.idempotencyKey;
    const body = {
      locale: 'tr',
      conversationId,
      price: input.amount,
      paidPrice: input.amount,
      currency: input.currency,
      basketId: input.orderNumber,
      paymentGroup: 'PRODUCT',
      callbackUrl: input.callbackUrl,
      enabledInstallments: [1, 2, 3, 6],
      buyer: {
        id: input.buyer.id,
        name: input.buyer.name,
        surname: input.buyer.surname,
        gsmNumber: input.buyer.phone,
        email: input.buyer.email,
        // iyzico requires a national id field; a placeholder is sent rather
        // than collecting a real one the product has no other use for.
        identityNumber: '11111111111',
        registrationAddress: input.buyer.addressLine,
        ip: input.buyer.ipAddress,
        city: input.buyer.city,
        country: input.buyer.country,
      },
      shippingAddress: {
        contactName: input.buyer.name,
        city: input.shippingCity,
        country: input.buyer.country,
        address: input.shippingAddressLine,
      },
      billingAddress: {
        contactName: input.buyer.name,
        city: input.buyer.city,
        country: input.buyer.country,
        address: input.buyer.addressLine,
      },
      basketItems: input.basket.map((item) => ({
        id: item.id,
        name: item.name,
        category1: 'Kişiselleştirilmiş kitap',
        itemType: 'PHYSICAL',
        price: item.price,
      })),
    };

    const response = await this.post('/payment/iyzipos/checkoutform/initialize/auth/ecom', body);

    if (response.status !== 'success') {
      throw this.toError(response);
    }

    const providerPaymentId = response.token ?? response.paymentId;
    if (!providerPaymentId) {
      throw new PaymentProviderError('iyzico returned no payment reference', 'unknown');
    }

    return {
      providerPaymentId,
      checkout: response.threeDSHtmlContent
        ? { kind: 'html_form', html: decodeHtmlContent(response.threeDSHtmlContent) }
        : response.paymentPageUrl
          ? { kind: 'redirect', url: response.paymentPageUrl }
          : { kind: 'none' },
      redactedPayload: redact(response),
    };
  }

  async verify(orderId: string, providerPaymentId: string): Promise<PaymentVerification> {
    const response = await this.post('/payment/iyzipos/checkoutform/auth/ecom/detail', {
      locale: 'tr',
      conversationId: orderId,
      token: providerPaymentId,
    });

    const succeeded = response.status === 'success' && response.paymentStatus === 'SUCCESS';

    return {
      status: succeeded ? 'succeeded' : response.paymentStatus === 'INIT_THREEDS' ? 'pending' : 'failed',
      providerPaymentId: response.paymentId ?? providerPaymentId,
      ...(succeeded ? {} : { providerErrorCode: response.errorCode ?? 'unknown' }),
      redactedPayload: redact(response),
    };
  }

  async refund(
    input: RefundInput,
  ): Promise<{ refunded: boolean; redactedPayload: Record<string, unknown> }> {
    const response = await this.post('/payment/refund', {
      locale: 'tr',
      conversationId: input.idempotencyKey,
      paymentTransactionId: input.providerPaymentId,
      price: input.amount,
      currency: input.currency,
    });

    return { refunded: response.status === 'success', redactedPayload: redact(response) };
  }

  /**
   * iyzico's authentication: an HMAC over the random key, the URI path and the
   * request body, sent as a base64 header alongside the random key itself.
   */
  private authorizationHeader(uriPath: string, body: string, randomKey: string): string {
    const payload = `${randomKey}${uriPath}${body}`;
    const signature = createHmac('sha256', this.config.secretKey)
      .update(payload)
      .digest('hex');
    const authorization = `apiKey:${this.config.apiKey}&randomKey:${randomKey}&signature:${signature}`;
    return `IYZWSv2 ${Buffer.from(authorization).toString('base64')}`;
  }

  private async post(uriPath: string, body: unknown): Promise<IyzicoResponse> {
    const serialised = JSON.stringify(body);
    const randomKey = `${String(Date.now())}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.config.baseUrl}${uriPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authorizationHeader(uriPath, serialised, randomKey),
          'x-iyzi-rnd': randomKey,
        },
        body: serialised,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new PaymentProviderError('iyzico rejected the credentials', 'unauthorized');
      }
      if (response.status >= 500) {
        throw new PaymentProviderError('iyzico is unavailable', 'unavailable');
      }

      return (await response.json()) as IyzicoResponse;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaymentProviderError('iyzico timed out', 'unavailable', { cause: error });
      }
      throw new PaymentProviderError('iyzico request failed', 'unknown', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  private toError(response: IyzicoResponse): PaymentProviderError {
    const code = response.errorCode ?? 'unknown';
    // iyzico's 10xxx range is card/bank refusals; everything else is our
    // request being wrong, which is not something to show a customer.
    const declined = code.startsWith('10');
    return new PaymentProviderError(
      response.errorMessage ?? 'iyzico declined the payment',
      declined ? 'declined' : 'invalid_request',
      { providerCode: code },
    );
  }
}

/** iyzico returns the 3DS form base64-encoded. */
function decodeHtmlContent(content: string): string {
  try {
    return Buffer.from(content, 'base64').toString('utf8');
  } catch {
    return content;
  }
}

/**
 * Keeps only fields that are safe to store.
 *
 * An allow-list rather than a deny-list: a provider adding a new field must not
 * be able to smuggle card data into our database because nobody updated a list
 * of things to strip (master prompt §47).
 */
function redact(response: IyzicoResponse): Record<string, unknown> {
  return {
    provider: 'iyzico',
    status: response.status,
    paymentStatus: response.paymentStatus,
    paymentId: response.paymentId,
    conversationId: response.conversationId,
    errorCode: response.errorCode,
  };
}
