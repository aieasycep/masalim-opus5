import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type AdminRole } from '@masalim/types';
import { AppError } from '../../core/errors/app-error';
import { ADMIN_ROLES_KEY, type RequestWithAdmin } from './admin.decorators';

/**
 * Least-privilege role check, evaluated per route.
 *
 * Absence of `@AdminRoles(...)` means ADMIN-only, so a new route that nobody
 * remembered to annotate is closed to Support and Operations rather than open
 * to both.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const admin = request.admin;
    if (!admin) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing admin session');
    }

    if (admin.role === 'ADMIN') return true;

    const allowed =
      this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!allowed.includes(admin.role)) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'This admin role cannot perform this action');
    }

    return true;
  }
}
