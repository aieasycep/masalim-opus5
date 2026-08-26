import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppLogger } from '../../core/logger/logger.service';

/** Only primitives, so an audit row is readable in the admin panel without a decoder. */
export type AuditMetadata = Record<string, string | number | boolean>;

export interface RetentionAuditEntry {
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: AuditMetadata;
}

/**
 * The accountability half of a purge.
 *
 * Every irreversible thing this module does leaves a row here with
 * `actorType: SYSTEM`, because a deletion nobody can later account for is
 * indistinguishable from data loss. AuditLog has no foreign key to User on
 * purpose, so the record outlives the account it describes.
 *
 * Written *after* the storage objects are gone and *before* the request is
 * marked complete. A crash between the two leaves a duplicate audit row on the
 * retry, which is harmless in an append-only log — the alternative ordering
 * would lose the record of a purge that really happened.
 *
 * Where the change itself destroys what would drive that retry — an account
 * purge takes its own DeletionRequest with it — `row()` puts the record in the
 * caller's transaction instead, so there is no window at all.
 */
@Injectable()
export class RetentionAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The same row, handed back instead of written.
   *
   * Lets an irreversible change and the record of it commit together, which
   * matters wherever the change destroys the thing that would drive a retry.
   */
  row(entry: RetentionAuditEntry): {
    actorType: 'SYSTEM';
    action: string;
    subjectType: string;
    subjectId: string;
    metadata?: AuditMetadata;
  } {
    return {
      actorType: 'SYSTEM',
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    };
  }

  async record(entry: RetentionAuditEntry): Promise<void> {
    await this.prisma.raw.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        ...(entry.metadata ? { metadata: entry.metadata } : {}),
      },
    });

    this.logger.pino.info(
      { action: entry.action, subjectType: entry.subjectType, subjectId: entry.subjectId },
      'retention action recorded',
    );
  }
}
