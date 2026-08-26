import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { EntitlementKey } from '@masalim/types';
import { REQUIRED_ENTITLEMENT_KEY, type AuthenticatedUser } from '../auth/auth.decorators';
import { EntitlementsService } from './entitlements.service';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** Enforces `@RequiresEntitlement(...)` before a premium handler runs. */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<EntitlementKey | undefined>(
      REQUIRED_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    // No user means the JwtAuthGuard already rejected, or the route is public —
    // in which case there is nothing to gate.
    if (!userId) return true;

    await this.entitlements.assertEntitled(userId, required);
    return true;
  }
}
