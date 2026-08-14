import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { normaliseAmount, type PrintProvider } from '@masalim/payments';
import {
  ERROR_CODES,
  type OrderDto,
  type OrderSummaryDto,
  type Paginated,
  type PriceQuoteDto,
} from '@masalim/types';
import type { CreateOrderInput, PriceQuoteInput } from '@masalim/validation';
import { PRINT_PROVIDER } from '../../core/commerce/commerce.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { AddressesService } from '../addresses/addresses.service';
import { PricingService } from './pricing.service';

/** Statuses a parent may still cancel from; past this the book is on a press. */
const CANCELLABLE: ReadonlySet<string> = new Set(['PENDING_PAYMENT', 'PAID']);

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRINT_PROVIDER) private readonly print: PrintProvider,
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly pricing: PricingService,
    private readonly addresses: AddressesService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /** The live price for a configuration, before anything is committed. */
  async quote(userId: string, input: PriceQuoteInput): Promise<PriceQuoteDto> {
    await this.policy.assertBook(userId, input.bookId);

    const city = input.addressId
      ? (await this.policy.assertAddress(userId, input.addressId)).city
      : undefined;

    const { breakdown, printProductId } = await this.pricing.quote({
      userId,
      bookId: input.bookId,
      bookSize: input.bookSize,
      coverType: input.coverType,
      quantity: input.quantity,
      city,
    });

    return this.toQuoteDto(breakdown, printProductId);
  }

  /**
   * Places an order.
   *
   * Three things happen together or not at all, in one transaction:
   *
   *  - the price is recomputed from the catalogue, ignoring anything the client
   *    might have sent about money;
   *  - an immutable snapshot of the book and the address is taken, so editing
   *    the book afterwards cannot change what was bought and deleting the
   *    address cannot lose where it ships (§81);
   *  - the order is written under a unique idempotency key, so a retried submit
   *    on a flaky connection returns the same order instead of printing two.
   */
  async create(userId: string, input: CreateOrderInput): Promise<OrderDto> {
    const existing = await this.prisma.client.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Idempotency key belongs to another account');
      }
      return this.findOne(userId, existing.id);
    }

    const book = await this.policy.assertBook(userId, input.bookId);
    const address = await this.policy.assertAddress(userId, input.addressId);

    const pages = await this.prisma.client.bookPage.findMany({
      where: { bookId: book.id },
      orderBy: { pageNumber: 'asc' },
      include: { illustration: true },
    });
    if (pages.length === 0) {
      throw new AppError(ERROR_CODES.BOOK_NOT_READY_FOR_PRINT, 'The book has no pages');
    }
    if (pages.some((page) => !page.illustrationId) || !book.coverIllustrationId) {
      throw new AppError(
        ERROR_CODES.BOOK_NOT_READY_FOR_PRINT,
        'Every page and the cover need an illustration before ordering',
      );
    }

    const { breakdown, printProductId } = await this.pricing.quote({
      userId,
      bookId: book.id,
      bookSize: input.bookSize,
      coverType: input.coverType,
      quantity: input.quantity,
      city: address.city,
    });

    const order = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          bookId: book.id,
          printProductId,
          orderNumber: this.orderNumber(),
          quantity: input.quantity,
          bookSize: input.bookSize,
          coverType: input.coverType,
          pageCount: breakdown.pageCount,
          subtotal: breakdown.subtotal,
          discount: breakdown.discount,
          shipping: breakdown.shipping,
          total: breakdown.total,
          currency: breakdown.currency,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          shippingAddressId: address.id,
          bookSnapshot: {
            title: book.title,
            subtitle: book.subtitle,
            dedication: book.dedication,
            backCoverText: book.backCoverText,
            coverIllustrationId: book.coverIllustrationId,
            pages: pages.map((page) => ({
              pageNumber: page.pageNumber,
              text: page.text,
              layout: page.layout,
              illustrationId: page.illustrationId,
              assetId: page.illustration?.assetId ?? null,
            })),
          },
          addressSnapshot: this.addresses.toDto(address),
          storyVersion: book.storyVersion,
          idempotencyKey: input.idempotencyKey,
          estimatedDeliveryMin: breakdown.estimatedDeliveryMin,
          estimatedDeliveryMax: breakdown.estimatedDeliveryMax,
        },
      });

      await tx.orderEvent.create({
        data: { orderId: created.id, type: 'ORDER_CREATED', payload: {} },
      });

      await tx.book.update({ where: { id: book.id }, data: { status: 'ORDERED' } });

      return created;
    });

    this.logger
      .child({ userId, orderId: order.id })
      .info({ orderNumber: order.orderNumber, total: breakdown.total }, 'order placed');

    return this.findOne(userId, order.id);
  }

  async list(
    userId: string,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<Paginated<OrderSummaryDto>> {
    const rows = await this.prisma.client.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { book: { include: { coverIllustration: true } } },
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);

    const items = await Promise.all(page.map((order) => this.toSummaryDto(order)));

    return { items, ...(hasMore && last ? { nextCursor: last.id } : {}) };
  }

  async findOne(userId: string, orderId: string): Promise<OrderDto> {
    await this.policy.assertOrder(userId, orderId);

    const order = await this.prisma.client.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        book: { include: { coverIllustration: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    return {
      ...(await this.toSummaryDto(order)),
      bookId: order.bookId,
      bookSize: order.bookSize,
      coverType: order.coverType,
      subtotal: { amount: normaliseAmount(order.subtotal.toString()), currency: order.currency },
      discount: { amount: normaliseAmount(order.discount.toString()), currency: order.currency },
      shipping: { amount: normaliseAmount(order.shipping.toString()), currency: order.currency },
      // Read from the snapshot, not the address row: the parcel goes where the
      // order said it would, even if the parent has since edited or deleted the
      // saved address.
      shippingAddress: order.addressSnapshot as unknown as OrderDto['shippingAddress'],
      estimatedDeliveryDays: {
        min: order.estimatedDeliveryMin,
        max: order.estimatedDeliveryMax,
      },
      events: order.events.map((event) => ({
        type: event.type,
        occurredAt: event.createdAt.toISOString(),
      })),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Cancels an order.
   *
   * Only while it is still ours to cancel: once the printer has it, the book is
   * being made and the honest answer is that it cannot be stopped.
   */
  async cancel(userId: string, orderId: string): Promise<OrderDto> {
    const order = await this.policy.assertOrder(userId, orderId);

    if (!CANCELLABLE.has(order.status)) {
      throw new AppError(
        ERROR_CODES.ORDER_NOT_CANCELLABLE,
        'This order has already gone into production',
      );
    }

    if (order.printProviderOrderId) {
      const cancelled = await this.print.cancel(order.printProviderOrderId);
      if (!cancelled) {
        throw new AppError(
          ERROR_CODES.ORDER_NOT_CANCELLABLE,
          'The printer has already started this order',
        );
      }
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      await tx.orderEvent.create({
        data: { orderId, type: 'ORDER_CANCELLED', payload: {} },
      });
    });

    return this.findOne(userId, orderId);
  }

  /** Records a state change from the printer, keeping the event history honest. */
  async recordEvent(
    orderId: string,
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.prisma.client.orderEvent.create({ data: { orderId, type, payload } });
  }

  /**
   * Human-facing order number.
   *
   * Random rather than sequential: a sequential number tells any customer how
   * many books the business has sold, and lets them guess their neighbour's.
   */
  private orderNumber(): string {
    const year = this.clock.now().getUTCFullYear();
    const suffix = randomBytes(4).readUInt32BE(0).toString(36).toUpperCase().padStart(6, '0');
    return `MSL-${String(year)}-${suffix}`;
  }

  private toQuoteDto(
    breakdown: Awaited<ReturnType<PricingService['quote']>>['breakdown'],
    productId: string,
  ): PriceQuoteDto {
    const money = (amount: string) => ({ amount, currency: breakdown.currency });
    return {
      productId,
      quantity: breakdown.quantity,
      pageCount: breakdown.pageCount,
      unitPrice: money(breakdown.unitPrice),
      subtotal: money(breakdown.subtotal),
      discount: money(breakdown.discount),
      shipping: money(breakdown.shipping),
      total: money(breakdown.total),
      estimatedDeliveryDays: {
        min: breakdown.estimatedDeliveryMin,
        max: breakdown.estimatedDeliveryMax,
      },
    };
  }

  private async toSummaryDto(order: {
    id: string;
    orderNumber: string;
    status: OrderSummaryDto['status'];
    paymentStatus: OrderSummaryDto['paymentStatus'];
    total: { toString: () => string };
    currency: OrderSummaryDto['total']['currency'];
    quantity: number;
    trackingNumber: string | null;
    createdAt: Date;
    bookSnapshot: unknown;
    book: { title: string; coverIllustration: { assetId: string | null } | null };
  }): Promise<OrderSummaryDto> {
    const snapshot = order.bookSnapshot as { title?: string } | null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: { amount: normaliseAmount(order.total.toString()), currency: order.currency },
      quantity: order.quantity,
      // The title as it was when ordered, so a renamed book does not rewrite
      // the parent's order history.
      bookTitle: snapshot?.title ?? order.book.title,
      coverImageUrl: await this.assets.signedUrlForAsset(
        order.book.coverIllustration?.assetId ?? null,
      ),
      trackingNumber: order.trackingNumber,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
