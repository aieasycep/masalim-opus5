import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { adminLoginSchema, type AdminLoginInput } from '@masalim/validation';
import type { AdminSessionDto } from '@masalim/types';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService, type AdminLoginContext } from './admin-auth.service';
import { AdminCaller, type AdminCallContext } from './admin.decorators';

function contextFrom(request: Request): AdminLoginContext {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}

/**
 * The console's own front door.
 *
 * `@Public()` only means "the parent-facing guard does not apply here" — the
 * routes below are either genuinely unauthenticated (login) or protected by
 * `AdminAuthGuard`, which accepts admin tokens and nothing else.
 */
@ApiTags('admin')
@Public()
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in to the operator console' })
  async login(
    @Body(zodBody(adminLoginSchema)) body: AdminLoginInput,
    @Req() request: Request,
  ): Promise<AdminSessionDto> {
    return this.auth.login(body, contextFrom(request));
  }

  @Post('auth/logout')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End this admin session; the token stops working immediately' })
  async logout(@AdminCaller() caller: AdminCallContext): Promise<void> {
    await this.auth.logout(caller);
  }
}
