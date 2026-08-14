import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { EntitlementsResponse, SubscriptionDto } from '@masalim/types';
import { CurrentUserId, Public } from '../../core/auth/auth.decorators';
import { SubscriptionsService } from './subscriptions.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('entitlements')
  @ApiOperation({ summary: 'What this account may do, and how much of it is left' })
  async entitlements(@CurrentUserId() userId: string): Promise<EntitlementsResponse> {
    return this.subscriptions.entitlementsFor(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Current subscription state' })
  async current(@CurrentUserId() userId: string): Promise<SubscriptionDto> {
    return this.subscriptions.current(userId);
  }

  /**
   * Re-reads the subscription from the store.
   *
   * The app calls this after a purchase completes. It is a request to *check*,
   * never an assertion — the entitlement comes from the provider.
   */
  @Post('refresh')
  @ApiOperation({ summary: 'Re-read the subscription from the store' })
  async refresh(@CurrentUserId() userId: string): Promise<SubscriptionDto> {
    return this.subscriptions.refresh(userId);
  }

  /**
   * Store webhook.
   *
   * Public because the store has no session, and authenticated instead by the
   * signature the provider verifies. It always answers 202: a store retries on
   * anything else, and confirming which forgery failed helps only an attacker.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiExcludeEndpoint()
  async webhook(@Req() request: RawBodyRequest): Promise<{ received: true }> {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    await this.subscriptions.handleWebhook(
      raw,
      request.headers as Record<string, string | undefined>,
    );
    return { received: true };
  }
}
