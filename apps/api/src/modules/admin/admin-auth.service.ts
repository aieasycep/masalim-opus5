import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import {
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AdminSessionDto,
  type AdminUserAccountDto,
} from '@masalim/types';
import { ADMIN_SESSION_TTL_SECONDS, type AdminLoginInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { Clock } from '../../core/time/clock';
import { TokenService } from '../../core/auth/jwt.service';
import { ARGON2_OPTIONS } from '../auth/auth.service';
import { AdminTokenService } from './admin-token.service';
import { ADMIN_AUDIT_ACTIONS, AdminAuditService } from './admin-audit.service';
import type { AdminCallContext } from './admin.decorators';


export interface AdminLoginContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AdminTokenService,
    private readonly jwt: TokenService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AdminAuditService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Signs an operator in.
   *
   * Both outcomes are written to the audit trail. A failed admin sign-in is
   * more interesting than a successful one — it is the first thing anyone
   * probing the console produces — so it is recorded even when the email
   * matches no account.
   */
  async login(input: AdminLoginInput, context: AdminLoginContext): Promise<AdminSessionDto> {
    await this.rateLimit.enforce(
      RATE_LIMIT_KEYS.AUTH_ATTEMPTS,
      `admin-login:${context.ip ?? 'unknown'}:${input.email}`,
    );

    const admin = await this.prisma.client.adminUser.findUnique({
      where: { email: input.email },
    });

    if (!admin) {
      // Hash anyway so a missing account and a wrong password take the same
      // time, and the console cannot be used to enumerate operators.
      await argon2.hash(input.password, ARGON2_OPTIONS).catch(() => undefined);
      await this.recordFailure(null, input.email, 'NO_SUCH_ACCOUNT', context);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    const valid = await argon2.verify(admin.passwordHash, input.password).catch(() => false);
    if (!valid) {
      await this.recordFailure(admin.id, input.email, 'BAD_PASSWORD', context);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!admin.isActive) {
      await this.recordFailure(admin.id, input.email, 'ACCOUNT_DISABLED', context);
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Admin account is not active');
    }

    const { token, sessionId } = await this.tokens.sign(admin.id, admin.role);

    await this.prisma.client.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: this.clock.now() },
    });

    await this.audit.record({
      action: ADMIN_AUDIT_ACTIONS.LOGIN,
      admin: { id: admin.id },
      subjectType: 'admin_user',
      subjectId: admin.id,
      metadata: { role: admin.role, sessionId },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    this.logger.child({ adminUserId: admin.id }).info({ role: admin.role }, 'admin signed in');

    return {
      admin: this.toAccountDto({ ...admin, lastLoginAt: this.clock.now() }),
      accessToken: token,
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    };
  }

  async logout(caller: AdminCallContext): Promise<void> {
    await this.tokens.revoke(caller.actor.sessionId);
    await this.audit.recordFor(caller, {
      action: ADMIN_AUDIT_ACTIONS.LOGOUT,
      subjectType: 'admin_user',
      subjectId: caller.actor.id,
      metadata: { sessionId: caller.actor.sessionId },
    });
  }

  private async recordFailure(
    adminUserId: string | null,
    email: string,
    reason: string,
    context: AdminLoginContext,
  ): Promise<void> {
    await this.audit.record({
      action: ADMIN_AUDIT_ACTIONS.LOGIN_FAILED,
      admin: adminUserId ? { id: adminUserId } : null,
      subjectType: 'admin_user',
      ...(adminUserId ? { subjectId: adminUserId } : {}),
      // The address is hashed like the IP beside it. A failed-login trail is
      // mostly other people's typos and mistargeted attempts, and keeping those
      // legible turns the audit log into a list of addresses worth trying.
      metadata: { reason, emailHash: this.jwt.hashIdentifier(email.toLowerCase()) ?? '' },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private toAccountDto(admin: {
    id: string;
    email: string;
    name: string;
    role: AdminUserAccountDto['role'];
    lastLoginAt: Date | null;
  }): AdminUserAccountDto {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    };
  }
}
