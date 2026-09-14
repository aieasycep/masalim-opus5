import { createHash, randomUUID } from 'node:crypto';
import type {
  InitiatePaymentInput,
  InitiatedPayment,
  PaymentProvider,
  PaymentVerification,
  RefundInput,
} from '../../types';
import { PaymentProviderError } from '../../types';

interface MockPaymentRecord {
  orderId: string;
  amount: string;
  status: 'pending' | 'succeeded' | 'failed';
  refunded: boolean;
}

/**
 * Payments without a provider.
 *
 * The whole checkout flow — 3D Secure hand-off, callback, verification, refund —
 * is walked for real; only the bank is imaginary. Two deliberate behaviours make
 * it useful rather than merely green:
 *
 *  - The outcome is derived from the order number, so a developer can reproduce
 *    a decline on demand instead of only ever seeing the happy path. Any order
 *    whose number hashes into the failing bucket is declined.
 *  - `verify` is the only thing that flips a payment to succeeded, exactly as a
 *    real provider works. A client cannot mark its own order paid.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly payments = new Map<string, MockPaymentRecord>();
  private readonly byIdempotencyKey = new Map<string, string>();

  async initiate(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      return this.toInitiated(existingId, input);
    }

    const providerPaymentId = `mock_pay_${randomUUID()}`;
    this.payments.set(providerPaymentId, {
      orderId: input.orderId,
      amount: input.amount,
      status: 'pending',
      refunded: false,
    });
    this.byIdempotencyKey.set(input.idempotencyKey, providerPaymentId);

    return this.toInitiated(providerPaymentId, input);
  }

  async verify(orderId: string, providerPaymentId: string): Promise<PaymentVerification> {
    const record = this.payments.get(providerPaymentId);
    if (!record) {
      throw new PaymentProviderError('Unknown payment', 'invalid_request');
    }
    if (record.orderId !== orderId) {
      // A payment belongs to exactly one order; anything else is a mix-up worth
      // failing loudly rather than quietly accepting.
      throw new PaymentProviderError('Payment does not belong to this order', 'invalid_request');
    }

    if (record.status === 'pending') {
      record.status = this.declines(orderId) ? 'failed' : 'succeeded';
    }

    return {
      status: record.status === 'succeeded' ? 'succeeded' : 'failed',
      providerPaymentId,
      ...(record.status === 'failed' ? { providerErrorCode: 'mock_declined' } : {}),
      redactedPayload: {
        provider: this.name,
        status: record.status,
        amount: record.amount,
      },
    };
  }

  async refund(
    input: RefundInput,
  ): Promise<{ refunded: boolean; redactedPayload: Record<string, unknown> }> {
    const record = this.payments.get(input.providerPaymentId);
    if (!record || record.status !== 'succeeded') {
      return { refunded: false, redactedPayload: { provider: this.name, reason: 'not_paid' } };
    }
    record.refunded = true;
    return {
      refunded: true,
      redactedPayload: { provider: this.name, amount: input.amount, status: 'refunded' },
    };
  }

  /** Deterministic ~1-in-8 decline, keyed on the order so it is reproducible. */
  private declines(orderId: string): boolean {
    const digest = createHash('sha256').update(orderId).digest();
    return (digest[0] ?? 0) % 8 === 0;
  }

  private toInitiated(
    providerPaymentId: string,
    input: InitiatePaymentInput,
  ): InitiatedPayment {
    return {
      providerPaymentId,
      // The shape a Turkish 3D Secure flow really returns: a form the app posts
      // inside a web view. Returning a plain URL here would let the mobile app
      // take a shortcut that breaks the moment iyzico is switched on.
      checkout: {
        kind: 'html_form',
        html: [
          '<!doctype html><html><body>',
          `<form id="masalim-mock-3ds" method="post" action="${escapeHtml(input.callbackUrl)}">`,
          `<input type="hidden" name="paymentId" value="${escapeHtml(providerPaymentId)}" />`,
          `<input type="hidden" name="orderId" value="${escapeHtml(input.orderId)}" />`,
          '<noscript><button type="submit">Devam et</button></noscript>',
          '</form>',
          '<script>document.getElementById("masalim-mock-3ds").submit();</script>',
          '</body></html>',
        ].join(''),
      },
      redactedPayload: {
        provider: this.name,
        orderNumber: input.orderNumber,
        amount: input.amount,
        currency: input.currency,
      },
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
