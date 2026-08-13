import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { EntitlementKey } from '@masalim/types';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'masalim:isPublic';
export const REQUIRED_ENTITLEMENT_KEY = 'masalim:requiredEntitlement';

/** Opt an endpoint out of authentication. Everything else requires a token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Gate an endpoint behind a boolean entitlement.
 *
 * The guard checks the caller's tier server-side, so hiding a button in the app
 * is a UX nicety rather than the actual protection.
 */
export const RequiresEntitlement = (entitlement: EntitlementKey) =>
  SetMetadata(REQUIRED_ENTITLEMENT_KEY, entitlement);

export interface AuthenticatedUser {
  id: string;
  email: string;
  locale: string;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/** Shorthand for the very common `@CurrentUser('id')`. */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user?.id;
});
