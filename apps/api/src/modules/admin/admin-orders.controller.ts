import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminOrderAdvanceSchema,
  adminOrderListSchema,
  adminOrderTrackingSchema,
  type AdminOrderAdvanceInput,
  type AdminOrderListInput,
  type AdminOrderTrackingInput,
} from '@masalim/validation';
import type { AdminOrderDto, AdminOrderSummaryDto, Paginated } from '@masalim/types';
import { zodBody, zodQuery } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminCaller, AdminRoles, type AdminCallContext } from './admin.decorators';
import { AdminOrdersService } from './admin-orders.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Public()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles('OPERATIONS')
@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get('orders')
  @ApiOperation({ summary: 'Orders, filtered by status or awaiting fulfilment' })
  async list(
    @Query(zodQuery(adminOrderListSchema)) query: AdminOrderListInput,
  ): Promise<Paginated<AdminOrderSummaryDto>> {
    return this.orders.list(query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'One order with its shipping address; this read is audited' })
  async findOne(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') orderId: string,
  ): Promise<AdminOrderDto> {
    return this.orders.findOne(caller, orderId);
  }

  @Post('orders/:id/status')
  @ApiOperation({ summary: 'Advance the fulfilment status' })
  async advance(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') orderId: string,
    @Body(zodBody(adminOrderAdvanceSchema)) body: AdminOrderAdvanceInput,
  ): Promise<AdminOrderDto> {
    return this.orders.advance(caller, orderId, body);
  }

  @Post('orders/:id/tracking')
  @ApiOperation({ summary: 'Attach or correct the shipment tracking number' })
  async attachTracking(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') orderId: string,
    @Body(zodBody(adminOrderTrackingSchema)) body: AdminOrderTrackingInput,
  ): Promise<AdminOrderDto> {
    return this.orders.attachTracking(caller, orderId, body);
  }
}
