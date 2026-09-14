import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '@masalim/types';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AdminTokenService } from './admin-token.service';
import type { RequestWithAdmin } from './admin.decorators';

/**
 * Authenticates an operator against `AdminUser`.
 *
 * Applied per controller rather than globally: admin controllers are marked
 * `@Public()` so the parent-facing `JwtAuthGuard` steps aside, and this guard
 * takes over. A parent's access token fails here because it is signed with a
 * different key and carries the wrong `typ`, and an admin token fails over
 * there for the same reasons — neither surface can be entered with the other's
 * credential.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AdminTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const token = this.extractToken(request);
    if (!token) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing admin bearer token');
    }

    const payload = await this.tokens.verify(token);

    // The role travels in the token for convenience, but it is re-read from the
    // database on every request: a demoted or deactivated operator must lose
    // access immediately, not when their token happens to expire.
    const admin = await this.prisma.client.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Admin account is not active');
    }

    request.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      sessionId: payload.jti,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
    return value;
  }
}
