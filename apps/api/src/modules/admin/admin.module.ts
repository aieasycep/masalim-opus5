import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminTokenService } from './admin-token.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminFeatureFlagsController } from './admin-feature-flags.controller';
import { AdminFeatureFlagsService } from './admin-feature-flags.service';

/**
 * The operator console's API.
 *
 * # Two populations, two credentials
 *
 * `AdminUser` is a separate table from `User` and admin sessions are a separate
 * token type: signed with a key derived from — not equal to — the parent access
 * secret, carrying `typ: admin` and the `masalim-admin` audience, both of which
 * are verified. A parent's token cannot open an admin route and an operator's
 * token cannot read a parent's library. Admin controllers are marked `@Public()`
 * purely so the global parent guard stands aside; `AdminAuthGuard` then runs in
 * its place, so nothing here is actually unauthenticated except the login route.
 *
 * # Role split
 *
 * Least privilege, decided by what each job actually touches. `AdminRolesGuard`
 * treats a missing `@AdminRoles(...)` as ADMIN-only, so a route added without a
 * decorator is closed rather than open.
 *
 *   OPERATIONS — orders and fulfilment. Advancing status, attaching tracking,
 *     reading the shipping address of the order they are packing. No user
 *     search, because chasing a parcel does not require browsing families.
 *   SUPPORT — the queues a person talks to a parent about: user lookup by email
 *     or id, deletion requests, and the moderation review queue. No fulfilment
 *     mutations, because a support conversation is not a warehouse action.
 *   ADMIN — everything above, plus feature flags. Flags are ADMIN-only because
 *     they change the product for every family at once, which is a different
 *     kind of power from resolving one case.
 *
 * Both other roles see the dashboard: it is aggregate counts, and an operator
 * who cannot see the queue depth cannot prioritise their own work.
 *
 * # Audit
 *
 * Every mutating route writes an `AuditLog` row with `actorType=ADMIN`, the
 * admin's id, the action and the subject — and, wherever the change and the row
 * can share a transaction, they do, so the trail cannot silently disagree with
 * what happened. Reads are audited too when they reveal something that belongs
 * to a family rather than to the service: a story's text, an account's details,
 * a doorstep. Everything else on this surface — queues, counts, lists — is
 * deliberately built from aggregates and identifiers, so operating the service
 * never turns into reading bedtime stories over families' shoulders.
 */
@Module({
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminModerationController,
    AdminOrdersController,
    AdminUsersController,
    AdminFeatureFlagsController,
  ],
  providers: [
    AdminAuthGuard,
    AdminRolesGuard,
    AdminTokenService,
    AdminAuditService,
    AdminAuthService,
    AdminDashboardService,
    AdminModerationService,
    AdminOrdersService,
    AdminUsersService,
    AdminFeatureFlagsService,
  ],
})
export class AdminModule {}
