import { randomUUID } from 'node:crypto';
import type { PrintOrderInput, PrintOrderStatus, PrintProvider } from '../../types';

/**
 * A print house that does not exist yet.
 *
 * No printer has been contracted, so this is the only implementation that ships.
 * It is deliberately more than a stub: it validates the file is reachable, keeps
 * per-order state, and advances through the same lifecycle a real printer
 * reports, so the order screens and the status mapping are exercised for real.
 */
export class MockPrintProvider implements PrintProvider {
  readonly name = 'mock';
  private readonly orders = new Map<string, PrintOrderStatus>();
  private readonly byIdempotencyKey = new Map<string, string>();

  async submit(input: PrintOrderInput): Promise<PrintOrderStatus> {
    const existing = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return this.orders.get(existing) ?? this.received(existing);
    }

    if (!input.item.fileUrl) {
      throw new Error('print order has no file to print');
    }

    const providerOrderId = `mock_print_${randomUUID()}`;
    const status = this.received(providerOrderId);
    this.orders.set(providerOrderId, status);
    this.byIdempotencyKey.set(input.idempotencyKey, providerOrderId);
    return status;
  }

  async getStatus(providerOrderId: string): Promise<PrintOrderStatus> {
    return this.orders.get(providerOrderId) ?? this.received(providerOrderId);
  }

  async cancel(providerOrderId: string): Promise<boolean> {
    const order = this.orders.get(providerOrderId);
    // Once a book is on a press it cannot be recalled, which is exactly the
    // constraint the cancellation window in the app exists for.
    if (!order || order.status !== 'received') return false;
    this.orders.set(providerOrderId, { ...order, status: 'cancelled' });
    return true;
  }

  /** Test and admin affordance: move an order along its lifecycle. */
  advance(providerOrderId: string, status: PrintOrderStatus['status'], tracking?: string): void {
    const order = this.orders.get(providerOrderId) ?? this.received(providerOrderId);
    this.orders.set(providerOrderId, {
      ...order,
      status,
      trackingNumber: tracking ?? order.trackingNumber,
    });
  }

  private received(providerOrderId: string): PrintOrderStatus {
    return { providerOrderId, status: 'received', trackingNumber: null };
  }
}
