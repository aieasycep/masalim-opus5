import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  FEATURE_FLAG_DEFAULTS,
  type AdminFeatureFlagDto,
} from '@masalim/types';
import {
  adminFeatureFlagKeySchema,
  type AdminFeatureFlagUpdateInput,
} from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { ADMIN_AUDIT_ACTIONS, AdminAuditService } from './admin-audit.service';
import type { AdminCallContext } from './admin.decorators';

@Injectable()
export class AdminFeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Every flag the platform knows about.
   *
   * Keys with no row yet are listed at their compiled-in default rather than
   * omitted: a switch that exists in the code but not in the database is still
   * a switch, and an operator who cannot see it cannot reason about a rollout.
   */
  async list(): Promise<AdminFeatureFlagDto[]> {
    const rows = await this.prisma.client.featureFlag.findMany({
      orderBy: { key: 'asc' },
      include: { updatedBy: { select: { name: true } } },
    });
    const stored = new Map(rows.map((row) => [row.key, row]));

    const defaults: AdminFeatureFlagDto[] = Object.entries(FEATURE_FLAG_DEFAULTS)
      .filter(([key]) => !stored.has(key))
      .map(([key, enabled]) => ({
        key,
        enabled,
        rolloutPercentage: 100,
        description: null,
        updatedByAdminName: null,
        // Nobody has ever moved this one, and saying so beats inventing a date.
        updatedAt: null,
      }));

    return [
      ...rows.map((row) => ({
        key: row.key,
        enabled: row.enabled,
        rolloutPercentage: row.rolloutPercentage,
        description: row.description,
        updatedByAdminName: row.updatedBy?.name ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      ...defaults,
    ].sort((left, right) => left.key.localeCompare(right.key));
  }

  /**
   * Flips a flag.
   *
   * Upserts, because a key that only exists as a compiled-in default has no row
   * to update until the first time somebody changes it. The audit row is written
   * in the same transaction: a rollout that nobody can be asked about is how a
   * production incident becomes a mystery.
   */
  async toggle(
    caller: AdminCallContext,
    rawKey: string,
    input: AdminFeatureFlagUpdateInput,
  ): Promise<AdminFeatureFlagDto> {
    const parsed = adminFeatureFlagKeySchema.safeParse(rawKey);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid feature flag key', {
        details: [{ path: 'key', code: 'FLAG_KEY_INVALID' }],
      });
    }
    const key = parsed.data;

    const known = key in FEATURE_FLAG_DEFAULTS;
    const existing = await this.prisma.client.featureFlag.findUnique({ where: { key } });
    if (!known && !existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Unknown feature flag');
    }

    const rollout = input.rolloutPercentage ?? existing?.rolloutPercentage ?? 100;

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.featureFlag.upsert({
        where: { key },
        create: {
          key,
          enabled: input.enabled,
          rolloutPercentage: rollout,
          updatedByAdminId: caller.actor.id,
        },
        update: {
          enabled: input.enabled,
          rolloutPercentage: rollout,
          updatedByAdminId: caller.actor.id,
        },
        include: { updatedBy: { select: { name: true } } },
      });

      await tx.auditLog.create({
        data: this.audit.rowFor(caller, {
          action: ADMIN_AUDIT_ACTIONS.FEATURE_FLAG_TOGGLE,
          subjectType: 'feature_flag',
          subjectId: key,
          metadata: {
            enabled: input.enabled,
            previousEnabled: existing?.enabled ?? null,
            rolloutPercentage: rollout,
            previousRolloutPercentage: existing?.rolloutPercentage ?? null,
            reason: input.reason ?? null,
          },
        }),
      });

      return row;
    });

    this.logger
      .child({ adminUserId: caller.actor.id })
      .warn({ key, enabled: updated.enabled, rolloutPercentage: rollout }, 'feature flag changed');

    return {
      key: updated.key,
      enabled: updated.enabled,
      rolloutPercentage: updated.rolloutPercentage,
      description: updated.description,
      updatedByAdminName: updated.updatedBy?.name ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
