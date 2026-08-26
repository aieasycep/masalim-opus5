import { Injectable } from '@nestjs/common';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TokenService } from '../../core/auth/jwt.service';
import { AppLogger } from '../../core/logger/logger.service';
import type { AdminCallContext } from './admin.decorators';

/** Stable action names; the trail is only searchable if they never drift. */
export const ADMIN_AUDIT_ACTIONS = {
  LOGIN: 'admin.auth.login',
  LOGIN_FAILED: 'admin.auth.login_failed',
  LOGOUT: 'admin.auth.logout',
  MODERATION_APPROVE: 'admin.moderation.approve',
  MODERATION_REJECT: 'admin.moderation.reject',
  MODERATION_SUBJECT_VIEW: 'admin.moderation.subject.view',
  ORDER_VIEW: 'admin.order.view',
  ORDER_ADVANCE: 'admin.order.status.advance',
  ORDER_TRACKING: 'admin.order.tracking.attach',
  USER_VIEW: 'admin.user.view',
  USER_DELETION_REQUESTS_VIEW: 'admin.user.deletion_requests.view',
  FEATURE_FLAG_TOGGLE: 'admin.feature_flag.toggle',
} as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

export interface AdminAuditParams {
  action: AdminAuditAction;
  /** Null only when the sign-in attempt never resolved to an account. */
  admin: { id: string } | null;
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** Exactly the columns of one `AuditLog` row, ready to hand to Prisma. */
export interface AdminAuditRow {
  actorType: 'ADMIN';
  actorId: string | null;
  adminUserId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  metadata: Prisma.InputJsonObject;
  ipHash: string | null;
  userAgent: string | null;
}

/**
 * The audit trail for operator actions.
 *
 * An admin touching a family's data must never be anonymous, so every mutating
 * route — and every read that reveals a child's story or a parent's doorstep —
 * writes a row here. `row()` exists so a caller can persist the entry inside the
 * same transaction as the change it describes: an order that moved to SHIPPED
 * with no audit row, because a second write failed, would be exactly the gap
 * this table exists to close.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly logger: AppLogger,
  ) {}

  row(params: AdminAuditParams): AdminAuditRow {
    // Undefined is dropped rather than stored, so an omitted detail reads as
    // absent in the trail instead of as an explicit null.
    const metadata: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(params.metadata ?? {})) {
      if (value !== undefined) metadata[key] = value;
    }

    return {
      actorType: 'ADMIN',
      actorId: params.admin?.id ?? null,
      adminUserId: params.admin?.id ?? null,
      action: params.action,
      subjectType: params.subjectType ?? null,
      subjectId: params.subjectId ?? null,
      metadata,
      // The raw address is never stored: it is needed to spot a compromised
      // console, not to place an operator at a desk.
      ipHash: this.tokens.hashIp(params.ip),
      userAgent: params.userAgent?.slice(0, 300) ?? null,
    };
  }

  /** Writes the row on its own, for actions that are not part of a transaction. */
  async record(params: AdminAuditParams): Promise<void> {
    const data = this.row(params);
    try {
      await this.prisma.client.auditLog.create({ data });
    } catch (error) {
      // Losing the trail is serious enough to shout about, but failing the
      // operator's request after the fact would not put the row back.
      this.logger.error(
        { err: error, action: data.action, adminUserId: data.adminUserId },
        'failed to write admin audit log',
      );
    }
  }

  /** Convenience for the common `record` call from an authenticated route. */
  async recordFor(
    caller: AdminCallContext,
    params: Omit<AdminAuditParams, 'admin' | 'ip' | 'userAgent'>,
  ): Promise<void> {
    await this.record({
      ...params,
      admin: { id: caller.actor.id },
      ip: caller.ip,
      userAgent: caller.userAgent,
    });
  }

  rowFor(
    caller: AdminCallContext,
    params: Omit<AdminAuditParams, 'admin' | 'ip' | 'userAgent'>,
  ): AdminAuditRow {
    return this.row({
      ...params,
      admin: { id: caller.actor.id },
      ip: caller.ip,
      userAgent: caller.userAgent,
    });
  }
}
