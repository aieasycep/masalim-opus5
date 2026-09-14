import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { appConfigQuerySchema, type AppConfigQuery } from '@masalim/validation';
import type { AppConfigDto, HomeDto } from '@masalim/types';
import { CurrentUserId, OptionalAuth } from '../../core/auth/auth.decorators';
import { zodQuery } from '../../core/http/zod-validation.pipe';
import { AppConfigModuleService } from './app-config.service';
import { HomeService } from './home.service';

@ApiTags('app')
@Controller()
export class AppConfigController {
  constructor(
    private readonly config: AppConfigModuleService,
    private readonly home: HomeService,
  ) {}

  /**
   * Feature flags and version policy.
   *
   * Reachable without a session because the app calls it before sign-in: a build
   * below the supported floor has to be told so on the splash screen, not after
   * the parent has typed their password.
   */
  @OptionalAuth()
  @Get('app/config')
  @ApiOperation({ summary: 'Feature flags and minimum supported version' })
  async appConfig(
    @CurrentUserId() userId: string | null,
    @Query(zodQuery(appConfigQuerySchema)) query: AppConfigQuery,
  ): Promise<AppConfigDto> {
    return this.config.forClient({
      userId,
      platform: query.platform,
      appVersion: query.appVersion,
    });
  }

  @Get('home')
  @ApiOperation({ summary: 'Everything the Home screen renders, in one request' })
  async homeFeed(@CurrentUserId() userId: string): Promise<HomeDto> {
    return this.home.forUser(userId);
  }
}
