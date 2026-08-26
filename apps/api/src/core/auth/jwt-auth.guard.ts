import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ERROR_CODES } from '@masalim/types';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './jwt.service';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
  type AuthenticatedUser,
} from './auth.decorators';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Authentication guard, applied globally.
 *
 * Endpoints are protected by default and must opt out with `@Public()`, so
 * forgetting a decorator fails closed rather than exposing data.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);
    if (!token) {
      if (isOptional) return true;
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing bearer token');
    }

    // On an optional route a stale token means "not signed in", not an error:
    // an expired session must not stop the app finding out it needs updating.
    const payload = await this.tokens.verifyAccessToken(token).catch((error: unknown) => {
      if (isOptional) return null;
      throw error;
    });
    if (!payload) return true;

    // A token stays cryptographically valid after the account is deleted, so
    // liveness is confirmed against the database on every request.
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, locale: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      if (isOptional) return true;
      throw new AppError(ERROR_CODES.ACCOUNT_DELETED, 'Account no longer exists');
    }

    request.user = { id: user.id, email: user.email, locale: user.locale };
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
