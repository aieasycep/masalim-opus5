import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createOrderSchema,
  initiatePaymentSchema,
  paginationSchema,
  priceQuoteSchema,
  verifyPaymentSchema,
  type CreateOrderInput,
  type InitiatePaymentInput,
  type PaginationInput,
  type PriceQuoteInput,
  type VerifyPaymentInput,
} from '@masalim/validation';
import type {
  OrderDto,
  OrderSummaryDto,
  Paginated,
  PaymentInitiationDto,
  PaymentStatus,
  PriceQuoteDto,
  PrintProductDto,
} from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody, zodQuery } from '../../core/http/zod-validation.pipe';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly pricing: PricingService,
  ) {}

  @Get('print-products')
  @ApiOperation({ summary: 'Available physical formats' })
  async products(): Promise<PrintProductDto[]> {
    return this.pricing.listProducts();
  }

  /**
   * The price of a configuration.
   *
   * A POST because the configuration is a body, not because it changes anything:
   * nothing is committed here.
   */
  @Post('orders/quote')
  @ApiOperation({ summary: 'Server-computed price for a configuration' })
  async quote(
    @CurrentUserId() userId: string,
    @Body(zodBody(priceQuoteSchema)) body: PriceQuoteInput,
  ): Promise<PriceQuoteDto> {
    return this.orders.quote(userId, body);
  }

  @Post('orders')
  @Idempotent()
  @ApiOperation({ summary: 'Place an order for a printed book' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(createOrderSchema)) body: CreateOrderInput,
  ): Promise<OrderDto> {
    return this.orders.create(userId, body);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Order history' })
  async list(
    @CurrentUserId() userId: string,
    @Query(zodQuery(paginationSchema)) query: PaginationInput,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.list(userId, query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'One order with its status history' })
  async findOne(@CurrentUserId() userId: string, @Param('id') orderId: string): Promise<OrderDto> {
    return this.orders.findOne(userId, orderId);
  }

  @Post('orders/:id/cancel')
  @ApiOperation({ summary: 'Cancel an order that has not gone to print' })
  async cancel(@CurrentUserId() userId: string, @Param('id') orderId: string): Promise<OrderDto> {
    return this.orders.cancel(userId, orderId);
  }

  @Post('payments/initiate')
  @Idempotent()
  @ApiOperation({ summary: 'Start a payment; returns the 3D Secure hand-off' })
  async initiate(
    @CurrentUserId() userId: string,
    @Body(zodBody(initiatePaymentSchema)) body: InitiatePaymentInput,
    @Req() request: Request,
  ): Promise<PaymentInitiationDto> {
    return this.payments.initiate(userId, body, request.ip ?? '0.0.0.0');
  }

  @Post('payments/verify')
  @ApiOperation({ summary: 'Confirm a payment with the provider' })
  async verify(
    @CurrentUserId() userId: string,
    @Body(zodBody(verifyPaymentSchema)) body: VerifyPaymentInput,
  ): Promise<{ status: PaymentStatus }> {
    return { status: await this.payments.verify(userId, body.orderId, body.providerPaymentId) };
  }
}
