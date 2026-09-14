import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  registerDeviceSchema,
  unregisterDeviceSchema,
  paginationSchema,
  type RegisterDeviceInput,
  type UnregisterDeviceInput,
  type PaginationInput,
} from '@masalim/validation';
import type { NotificationDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { zodBody, zodQuery } from '../../core/http/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'In-app notification list' })
  async list(
    @CurrentUserId() userId: string,
    @Query(zodQuery(paginationSchema)) query: PaginationInput,
  ): Promise<NotificationDto[]> {
    return this.notifications.list(userId, query.limit);
  }

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this device for push' })
  async registerDevice(
    @CurrentUserId() userId: string,
    @Body(zodBody(registerDeviceSchema)) body: RegisterDeviceInput,
  ): Promise<void> {
    await this.notifications.registerDevice(userId, body);
  }

  @Post('devices/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop sending push to this device' })
  async unregisterDevice(
    @CurrentUserId() userId: string,
    @Body(zodBody(unregisterDeviceSchema)) body: UnregisterDeviceInput,
  ): Promise<void> {
    await this.notifications.unregisterDevice(userId, body.token);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(
    @CurrentUserId() userId: string,
    @Param('id') notificationId: string,
  ): Promise<void> {
    await this.notifications.markRead(userId, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark every notification read' })
  async markAllRead(@CurrentUserId() userId: string): Promise<void> {
    await this.notifications.markAllRead(userId);
  }
}
