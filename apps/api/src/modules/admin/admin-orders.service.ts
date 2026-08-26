import { Inject, Injectable } from '@nestjs/common';
import { normaliseAmount, type PrintProvider } from '@masalim/payments';
import {
  ERROR_CODES,
  type AddressDto,
  type AdminOrderDto,
  type AdminOrderSummaryDto,
  type OrderStatus,
  type Paginated,
} from '@masalim/types';
import type {
  AdminOrderAdvanceInput,
  AdminOrderListInput,
  AdminOrderTrackingInput,
} from '@masalim/validation';
import { PRINT_PROVIDER } from '../../core/commerce/commerce.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ADMIN_AUDIT_ACTIONS, AdminAuditService } from './admin-audit.service';
import type { AdminCallContext } from './admin.decorators';

/** Paid, and the book has not left the building yet. */
export const AWAITING_FULFILMENT_STATUSES = ['PAID', 'IN_PRODUCTION'] as const;

/**
 * Where an order may go next, by hand.
 *
 * Refunds are deliberately absent: money moves through the payment provider,
 * not through a dropdown in the console.
 *
 * Cancelling from PAID or IN_PRODUCTION is permitted here where the parent's
 * own path refuses it, because an operator sometimes has to stop an order the
 * customer cannot — but only by actually recalling the print job first. The
 * printer, not this table, decides whether that is still possible.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses where attaching or correcting a tracking number still makes sense. */
const TRACKABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'PAID',
  'IN_PRODUCTION',
  'SHIPPED',
]);

interface AddressSnapshot {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  district?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
    private readonly logger: AppLogger,
    @Inject(PRINT_PROVIDER) private readonly print: PrintProvider,
  ) {}

  /**
   * The fulfilment work list.
   *
   * Destination city and nothing finer: routing a shipment needs the İl, and
   * scrolling a list of doorsteps is not an operational need.
   */
  async list(input: AdminOrderListInput): Promise<Paginated<AdminOrderSummaryDto>> {
    const rows = await this.prisma.client.order.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
        ...(input.orderNumber ? { orderNumber: { contains: input.orderNumber } } : {}),
        ...(input.awaitingFulfilment && !input.status
          ? { status: { in: [...AWAITING_FULFILMENT_STATUSES] } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((order) => this.toSummaryDto(order)),
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
  }

  /**
   * One order, including where it ships to.
   *
   * That address is the reason this read is audited: it is a family's front
   * door, and an operator opening it should leave a trace.
   */
  async findOne(caller: AdminCallContext, orderId: string): Promise<AdminOrderDto> {
    const order = await this.loadOrder(orderId);

    await this.audit.recordFor(caller, {
      action: ADMIN_AUDIT_ACTIONS.ORDER_VIEW,
      subjectType: 'order',
      subjectId: order.id,
      metadata: { orderNumber: order.orderNumber, userId: order.userId },
    });

    return this.toDto(order);
  }

  /**
   * Moves an order forward.
   *
   * Shipping without a tracking number is refused: the parent's "kargoya
   * verildi" notification quotes that number, and a notification that arrives
   * with nothing to track is worse than no notification.
   */
  async advance(
    caller: AdminCallContext,
    orderId: string,
    input: AdminOrderAdvanceInput,
  ): Promise<AdminOrderDto> {
    const order = await this.loadOrder(orderId);
    const allowed = ALLOWED_TRANSITIONS[order.status];

    if (!allowed.includes(input.status)) {
      throw new AppError(
        input.status === 'CANCELLED'
          ? ERROR_CODES.ORDER_NOT_CANCELLABLE
          : ERROR_CODES.CONFLICT,
        `An order in ${order.status} cannot move to ${input.status}`,
      );
    }

    if (input.status === 'SHIPPED' && !order.trackingNumber) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'Attach a tracking number before marking the order shipped',
      );
    }

    // A cancellation the printer never heard about is the worst outcome
    // available here: the console says stopped, the press says otherwise, and a
    // book arrives at a family who were told it would not. The provider is
    // asked first and its refusal is final — everything below only records what
    // has already been agreed upstream.
    if (input.status === 'CANCELLED' && order.printProviderOrderId) {
      const recalled = await this.print.cancel(order.printProviderOrderId);
      if (!recalled) {
        throw new AppError(
          ERROR_CODES.CONFLICT,
          'The printer has already started this order and will not recall it',
        );
      }
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: input.status } });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: `ORDER_${input.status}`,
          payload: {
            from: order.status,
            adminUserId: caller.actor.id,
            ...(input.note ? { note: input.note } : {}),
          },
        },
      });
      await tx.auditLog.create({
        data: this.audit.rowFor(caller, {
          action: ADMIN_AUDIT_ACTIONS.ORDER_ADVANCE,
          subjectType: 'order',
          subjectId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            userId: order.userId,
            from: order.status,
            to: input.status,
            note: input.note ?? null,
            ...(input.status === 'CANCELLED'
              ? { printJobRecalled: order.printProviderOrderId !== null }
              : {}),
          },
        }),
      });
    });

    this.logger
      .child({ adminUserId: caller.actor.id, orderId: order.id })
      .info({ from: order.status, to: input.status }, 'order status advanced by admin');

    await this.notifyStatus(order.userId, order.id, order.orderNumber, input.status, order.trackingNumber);

    return this.toDto(await this.loadOrder(orderId));
  }

  async attachTracking(
    caller: AdminCallContext,
    orderId: string,
    input: AdminOrderTrackingInput,
  ): Promise<AdminOrderDto> {
    const order = await this.loadOrder(orderId);

    if (!TRACKABLE.has(order.status)) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `An order in ${order.status} has nothing left to track`,
      );
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { trackingNumber: input.trackingNumber },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'TRACKING_ATTACHED',
          payload: {
            adminUserId: caller.actor.id,
            ...(input.carrier ? { carrier: input.carrier } : {}),
          },
        },
      });
      await tx.auditLog.create({
        data: this.audit.rowFor(caller, {
          action: ADMIN_AUDIT_ACTIONS.ORDER_TRACKING,
          subjectType: 'order',
          subjectId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            userId: order.userId,
            trackingNumber: input.trackingNumber,
            carrier: input.carrier ?? null,
            replaced: order.trackingNumber ?? null,
          },
        }),
      });
    });

    // A correction after the parent has already been told the old number leaves
    // them holding a code that tracks nothing. The push quotes the number, so a
    // change to it has to be sent again or the first message stays wrong.
    if (order.status === 'SHIPPED' && order.trackingNumber !== input.trackingNumber) {
      await this.notifications.notify({
        userId: order.userId,
        type: 'ORDER_SHIPPED',
        titleKey: 'notification.orderShipped.title',
        bodyKey: 'notification.orderShipped.body',
        values: { tracking: input.trackingNumber },
        link: { host: 'order', id: order.id },
      });
    }

    return this.toDto(await this.loadOrder(orderId));
  }

  private async notifyStatus(
    userId: string,
    orderId: string,
    orderNumber: string,
    status: AdminOrderAdvanceInput['status'],
    trackingNumber: string | null,
  ): Promise<void> {
    if (status === 'SHIPPED') {
      await this.notifications.notify({
        userId,
        type: 'ORDER_SHIPPED',
        titleKey: 'notification.orderShipped.title',
        bodyKey: 'notification.orderShipped.body',
        values: { tracking: trackingNumber ?? orderNumber },
        link: { host: 'order', id: orderId },
      });
      return;
    }

    if (status === 'DELIVERED') {
      await this.notifications.notify({
        userId,
        type: 'ORDER_DELIVERED',
        titleKey: 'notification.orderDelivered.title',
        bodyKey: 'notification.orderDelivered.body',
        link: { host: 'order', id: orderId },
      });
    }
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true } },
        book: { select: { title: true } },
        events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } },
      },
    });
    if (!order) {
      throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, 'Order not found');
    }
    return order;
  }

  private toSummaryDto(order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: AdminOrderSummaryDto['paymentStatus'];
    total: { toString: () => string };
    currency: AdminOrderSummaryDto['total']['currency'];
    quantity: number;
    bookSize: AdminOrderSummaryDto['bookSize'];
    coverType: AdminOrderSummaryDto['coverType'];
    pageCount: number;
    addressSnapshot: unknown;
    trackingNumber: string | null;
    printProviderOrderId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminOrderSummaryDto {
    const address = this.addressSnapshot(order.addressSnapshot);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: { amount: normaliseAmount(order.total.toString()), currency: order.currency },
      quantity: order.quantity,
      bookSize: order.bookSize,
      coverType: order.coverType,
      pageCount: order.pageCount,
      shippingCity: address?.city ?? null,
      trackingNumber: order.trackingNumber,
      printProviderOrderId: order.printProviderOrderId,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toDto(
    order: Awaited<ReturnType<AdminOrdersService['loadOrder']>>,
  ): AdminOrderDto {
    const snapshot = order.bookSnapshot as { title?: string } | null;
    return {
      ...this.toSummaryDto(order),
      userId: order.userId,
      userEmail: order.user.email,
      bookId: order.bookId,
      bookTitle: snapshot?.title ?? order.book.title,
      estimatedDeliveryDays: {
        min: order.estimatedDeliveryMin,
        max: order.estimatedDeliveryMax,
      },
      shippingAddress: this.toAddressDto(order.id, order.addressSnapshot),
      events: order.events.map((event) => ({
        type: event.type,
        occurredAt: event.createdAt.toISOString(),
      })),
    };
  }

  private addressSnapshot(value: unknown): AddressSnapshot | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as AddressSnapshot;
  }

  /** The frozen snapshot, not the live address: the book ships where it was bought. */
  private toAddressDto(orderId: string, value: unknown): AddressDto | null {
    const snapshot = this.addressSnapshot(value);
    if (!snapshot?.line1 || !snapshot.city) return null;
    return {
      id: `${orderId}:snapshot`,
      fullName: snapshot.fullName ?? '',
      phone: snapshot.phone ?? '',
      line1: snapshot.line1,
      line2: snapshot.line2 ?? null,
      district: snapshot.district ?? '',
      city: snapshot.city,
      postalCode: snapshot.postalCode ?? '',
      countryCode: snapshot.countryCode ?? 'TR',
      isDefault: false,
    };
  }
}
