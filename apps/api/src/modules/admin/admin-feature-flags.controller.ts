import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminFeatureFlagUpdateSchema,
  type AdminFeatureFlagUpdateInput,
} from '@masalim/validation';
import type { AdminFeatureFlagDto } from '@masalim/types';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminCaller, type AdminCallContext } from './admin.decorators';
import { AdminFeatureFlagsService } from './admin-feature-flags.service';

/**
 * ADMIN only, and deliberately not delegated: a flag changes what every family
 * on the service can do, which is a different kind of power from handling one
 * order or one review.
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@Public()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@Controller('admin')
export class AdminFeatureFlagsController {
  constructor(private readonly flags: AdminFeatureFlagsService) {}

  @Get('feature-flags')
  @ApiOperation({ summary: 'Every feature flag, stored or still at its default' })
  async list(): Promise<AdminFeatureFlagDto[]> {
    return this.flags.list();
  }

  @Put('feature-flags/:key')
  @ApiOperation({ summary: 'Enable, disable or re-scope a feature flag' })
  async toggle(
    @AdminCaller() caller: AdminCallContext,
    @Param('key') key: string,
    @Body(zodBody(adminFeatureFlagUpdateSchema)) body: AdminFeatureFlagUpdateInput,
  ): Promise<AdminFeatureFlagDto> {
    return this.flags.toggle(caller, key, body);
  }
}
