import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  audioPreferencesSchema,
  notificationPreferencesSchema,
  requestAccountDeletionSchema,
  updateProfileSchema,
  type AudioPreferencesInput,
  type NotificationPreferencesInput,
  type RequestAccountDeletionInput,
  type UpdateProfileInput,
} from '@masalim/validation';
import type {
  DeletionRequestDto,
  EntitlementsResponse,
  UserDto,
} from '@masalim/types';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Current signed-in user' })
  async me(@CurrentUserId() userId: string): Promise<UserDto> {
    return this.users.findMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile details' })
  async updateMe(
    @CurrentUserId() userId: string,
    @Body(zodBody(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<UserDto> {
    return this.users.updateProfile(userId, body);
  }

  @Post('me/onboarding-complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark onboarding as finished' })
  async completeOnboarding(@CurrentUserId() userId: string): Promise<UserDto> {
    return this.users.completeOnboarding(userId);
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'Entitlements and monthly usage for the current tier' })
  async entitlementsSummary(@CurrentUserId() userId: string): Promise<EntitlementsResponse> {
    return this.entitlements.summaryFor(userId);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: 'Notification preferences' })
  async notificationPreferences(
    @CurrentUserId() userId: string,
  ): Promise<NotificationPreferencesInput> {
    return this.users.getNotificationPreferences(userId);
  }

  @Patch('me/notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updateNotificationPreferences(
    @CurrentUserId() userId: string,
    @Body(zodBody(notificationPreferencesSchema)) body: NotificationPreferencesInput,
  ): Promise<NotificationPreferencesInput> {
    return this.users.updateNotificationPreferences(userId, body);
  }

  @Get('me/audio-preferences')
  @ApiOperation({ summary: 'Audio playback preferences' })
  async audioPreferences(@CurrentUserId() userId: string): Promise<AudioPreferencesInput> {
    return this.users.getAudioPreferences(userId);
  }

  @Patch('me/audio-preferences')
  @ApiOperation({ summary: 'Update audio playback preferences' })
  async updateAudioPreferences(
    @CurrentUserId() userId: string,
    @Body(zodBody(audioPreferencesSchema)) body: AudioPreferencesInput,
  ): Promise<AudioPreferencesInput> {
    return this.users.updateAudioPreferences(userId, body);
  }

  @Post('me/deletion-request')
  @ApiOperation({ summary: 'Schedule permanent account deletion' })
  async requestDeletion(
    @CurrentUserId() userId: string,
    @Body(zodBody(requestAccountDeletionSchema)) body: RequestAccountDeletionInput,
  ): Promise<DeletionRequestDto> {
    return this.users.requestAccountDeletion(userId, body);
  }

  @Get('me/deletion-requests')
  @ApiOperation({ summary: 'Status of deletion requests' })
  async deletionRequests(@CurrentUserId() userId: string): Promise<DeletionRequestDto[]> {
    return this.users.listDeletionRequests(userId);
  }
}
