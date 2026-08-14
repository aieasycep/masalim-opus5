import { Inject, Injectable } from '@nestjs/common';
import { PaymentProviderError, type PaymentProvider, type PrintProvider } from '@masalim/payments';
import { ERROR_CODES, type PaymentInitiationDto, type PaymentStatus } from '@masalim/types';
import type { InitiatePaymentInput } from '@masalim/validation';
import { PAYMENT_PROVIDER, PRINT_PROVIDER } from '../../core/commerce/commerce.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { AssetsService } from '../assets/assets.service';
import { OrdersService } from './orders.service';

interface AddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  district: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(PRINT_PROVIDER) private readonly print: PrintProvider,
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly orders: OrdersService,
    private readonly assets: AssetsService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Starts a payment for an order.
   *
   * The amount comes from the order row, which was computed server-side when the
   * order was placed — the client cannot influence what is charged even here.
   */
  async initiate(
    userId: string,
    input: InitiatePaymentInput,
    ipAddress: string,
  ): Promise<PaymentInitiationDto> {
    const order = await this.policy.assertOrder(userId, input.orderId);

    if (order.paymentStatus === 'PAID') {
      throw new AppError(ERROR_CODES.CONFLICT, 'This order has already been paid');
    }
    if (order.status === 'CANCELLED') {
      throw new AppError(ERROR_CODES.ORDER_NOT_CANCELLABLE, 'This order was cancelled');
    }

    const existing = await this.prisma.client.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing?.providerPaymentId) {
      // The customer tapped again, or the app retried. Re-initiating would open
      // a second authorisation against the same card.
      const payload = existing.redactedPayload as { checkout?: unknown } | null;
      return {
        paymentId: existing.id,
        providerPaymentId: existing.providerPaymentId,
        checkout: (payload?.checkout as PaymentInitiationDto['checkout']) ?? { kind: 'none' },
      };
    }

    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const address = order.addressSnapshot as unknown as AddressSnapshot;
    const [firstName, ...rest] = (address.fullName || user.name || 'Masalım').split(' ');

    const payment = await this.prisma.client.payment.create({
      data: {
        orderId: order.id,
        provider: this.payments.name,
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
      },
    });

    try {
      const initiated = await this.payments.initiate({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.total.toString(),
        currency: order.currency,
        buyer: {
          id: user.id,
          name: firstName ?? 'Masalım',
          surname: rest.join(' ') || firstName || 'Kullanıcı',
          email: user.email,
          phone: address.phone,
          addressLine: `${address.line1}, ${address.district}`,
          city: address.city,
          country: address.countryCode === 'TR' ? 'Turkey' : address.countryCode,
          ipAddress,
        },
        shippingAddressLine: `${address.line1}, ${address.district}`,
        shippingCity: address.city,
        basket: [
          {
            id: order.bookId,
            name: 'Kişiselleştirilmiş masal kitabı',
            price: order.total.toString(),
          },
        ],
        callbackUrl: input.returnUrl,
        idempotencyKey: input.idempotencyKey,
      });

      await this.prisma.client.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: initiated.providerPaymentId,
          // The checkout instructions are stored so a retry can replay them
          // rather than opening a second authorisation.
          redactedPayload: { ...initiated.redactedPayload, checkout: initiated.checkout },
        },
      });

      await this.orders.recordEvent(order.id, 'PAYMENT_INITIATED');

      return {
        paymentId: payment.id,
        providerPaymentId: initiated.providerPaymentId,
        checkout: initiated.checkout,
      };
    } catch (error) {
      await this.failPayment(payment.id, error);
      throw this.toDomainError(error);
    }
  }

  /**
   * Confirms a payment with the provider.
   *
   * The provider is the only authority: the client calls this after the 3D
   * Secure web view closes, and so does the provider's own callback. Both paths
   * land here and the result is the same, because a client saying "it worked" is
   * not evidence that a card was charged.
   */
  async verify(userId: string, orderId: string, providerPaymentId: string): Promise<PaymentStatus> {
    const order = await this.policy.assertOrder(userId, orderId);

    const payment = await this.prisma.client.payment.findFirst({
      where: { orderId: order.id, providerPaymentId },
    });
    if (!payment) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'No such payment for this order');
    }
    if (payment.status === 'PAID') {
      return 'PAID';
    }

    const verification = await this.payments
      .verify(order.id, providerPaymentId)
      .catch((error: unknown) => {
        throw this.toDomainError(error);
      });

    if (verification.status === 'pending') {
      return 'PENDING';
    }

    if (verification.status !== 'succeeded') {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            errorCode: verification.providerErrorCode ?? null,
            redactedPayload: verification.redactedPayload,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'FAILED' },
        });
        await tx.orderEvent.create({
          data: { orderId: order.id, type: 'PAYMENT_FAILED', payload: {} },
        });
      });

      throw new AppError(ERROR_CODES.PAYMENT_DECLINED);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          providerPaymentId: verification.providerPaymentId,
          redactedPayload: verification.redactedPayload,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', paymentStatus: 'PAID' },
      });
      await tx.orderEvent.create({
        data: { orderId: order.id, type: 'PAYMENT_SUCCEEDED', payload: {} },
      });
    });

    this.logger
      .child({ userId, orderId: order.id })
      .info({ orderNumber: order.orderNumber }, 'payment confirmed');

    // Sending to the printer must not undo a confirmed payment, so it happens
    // after the transaction and its failure is recoverable by retrying.
    await this.submitToPrinter(order.id).catch((error: unknown) => {
      this.logger
        .child({ orderId: order.id })
        .error({ err: error }, 'order paid but not yet sent to the printer');
    });

    return 'PAID';
  }

  /**
   * Hands the finished print file to the print house.
   *
   * Idempotent on the order's own key, so a retry after a network failure does
   * not print the book twice.
   */
  async submitToPrinter(orderId: string): Promise<void> {
    const order = await this.prisma.client.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { book: { include: { renders: { where: { kind: 'PRINT_PDF', status: 'READY' } } } } },
    });

    if (order.printProviderOrderId) return;

    const render = order.book.renders.at(-1);
    if (!render?.assetId) {
      throw new AppError(
        ERROR_CODES.BOOK_NOT_READY_FOR_PRINT,
        'No print-ready file has been rendered for this book',
      );
    }

    const fileUrl = await this.assets.signedUrlForAsset(render.assetId, 7 * 24 * 60 * 60);
    if (!fileUrl) {
      throw new AppError(ERROR_CODES.BOOK_NOT_READY_FOR_PRINT, 'The print file is unreadable');
    }

    const address = order.addressSnapshot as unknown as AddressSnapshot;

    const status = await this.print.submit({
      orderNumber: order.orderNumber,
      item: {
        fileUrl,
        quantity: order.quantity,
        bookSize: order.bookSize,
        coverType: order.coverType,
        pageCount: order.pageCount,
      },
      recipient: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        district: address.district,
        city: address.city,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
      },
      idempotencyKey: `print:${order.id}`,
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { printProviderOrderId: status.providerOrderId, status: 'IN_PRODUCTION' },
      });
      await tx.orderEvent.create({
        data: { orderId: order.id, type: 'SENT_TO_PRINTER', payload: {} },
      });
    });
  }

  private async failPayment(paymentId: string, error: unknown): Promise<void> {
    const code =
      error instanceof PaymentProviderError ? (error.providerCode ?? error.kind) : 'unknown';
    await this.prisma.client.payment
      .update({ where: { id: paymentId }, data: { status: 'FAILED', errorCode: code } })
      .catch(() => undefined);
  }

  private toDomainError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof PaymentProviderError) {
      if (error.kind === 'declined') {
        // The bank's own wording is not something to relay: it is often in
        // English, often technical, and occasionally reveals card details.
        return new AppError(ERROR_CODES.PAYMENT_DECLINED, error.message, { cause: error });
      }
      if (error.kind === 'unavailable') {
        return new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, error.message, { cause: error });
      }
      return new AppError(ERROR_CODES.PAYMENT_FAILED, error.message, { cause: error });
    }
    return new AppError(ERROR_CODES.PAYMENT_FAILED, 'Payment failed', { cause: error });
  }
}
