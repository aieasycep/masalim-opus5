import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { adminLoginSchema, type AdminLoginInput } from '@masalim/validation';
import type { AdminSessionDto, AdminUserAccountDto } from '@masalim/types';
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

  /**
   * Who this token belongs to.
   *
   * The console renders its navigation from the answer, so the role has to come
   * from the server on every load rather than from anything the browser kept:
   * a demotion takes effect the moment it is made, and a stale client-side copy
   * would keep showing links the API is now going to refuse.
   */
  @Get('auth/me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The signed-in operator' })
  async me(@AdminCaller() caller: AdminCallContext): Promise<AdminUserAccountDto> {
    return this.auth.current(caller);
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
