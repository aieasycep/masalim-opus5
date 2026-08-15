import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminRole } from '@masalim/types';

export const ADMIN_ROLES_KEY = 'masalim:adminRoles';

/**
 * Roles allowed on a route, on top of ADMIN.
 *
 * ADMIN is a superset and is admitted everywhere, so a route only lists the
 * narrower roles it wants to let in. A route with no decorator is ADMIN-only —
 * forgetting it fails closed.
 */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

/** The authenticated operator, resolved by `AdminAuthGuard`. */
export interface AdminActor {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** Token id, so a single session can be revoked on sign-out. */
  sessionId: string;
}

/**
 * Everything an audit row needs about who is acting and from where.
 *
 * Passed down to the services rather than re-derived there: an admin action is
 * only meaningful in the audit trail together with the request it arrived on.
 */
export interface AdminCallContext {
  actor: AdminActor;
  ip: string | undefined;
  userAgent: string | undefined;
}

export interface RequestWithAdmin extends Request {
  admin?: AdminActor;
}

export const AdminCaller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminCallContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    const actor = request.admin;
    if (!actor) {
      // Unreachable behind AdminAuthGuard; throwing beats handing a service a
      // half-built context that would produce an anonymous audit row.
      throw new Error('AdminCaller used on a route without AdminAuthGuard');
    }
    return {
      actor,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };
  },
);
