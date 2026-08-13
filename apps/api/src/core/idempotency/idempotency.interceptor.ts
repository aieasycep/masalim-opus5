import {
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { from, of, switchMap, tap, type Observable } from 'rxjs';
import { ERROR_CODES } from '@masalim/types';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { Clock } from '../time/clock';
import type { AuthenticatedUser } from '../auth/auth.decorators';

export const IDEMPOTENT_KEY = 'masalim:idempotent';

/**
 * Marks a handler as idempotent.
 *
 * A repeated call with the same key returns the original response instead of
 * charging a card twice, queueing a second generation job or creating a
 * duplicate order (master prompt §59).
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  requestId?: string;
}

/** How long a stored response stays replayable. */
const RETENTION_HOURS = 24;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const key = this.extractKey(request);
    if (!key) return next.handle();

    const userId = request.user?.id ?? null;
    // Scoping the stored key by user stops one account's key from colliding
    // with — or replaying — another's.
    const storageKey = `${userId ?? 'anon'}:${key}`;
    const endpoint = `${request.method} ${request.route?.path ?? request.path}`;
    const requestHash = this.hashRequest(request);

    return from(this.lookup(storageKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) {
            // Same key, different payload: the client has a bug, and silently
            // returning the old response would hide it.
            throw new AppError(
              ERROR_CODES.CONFLICT,
              'Idempotency key reused with a different payload',
              { logContext: { endpoint } },
            );
          }
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('Idempotent-Replay', 'true');
          response.status(existing.statusCode);
          return of(existing.response);
        }

        return next.handle().pipe(
          tap({
            next: (body) => {
              const response = context.switchToHttp().getResponse<Response>();
              void this.store({
                key: storageKey,
                userId,
                endpoint,
                requestHash,
                statusCode: response.statusCode,
                body,
              });
            },
          }),
        );
      }),
    );
  }

  private extractKey(request: RequestWithUser): string | null {
    const header = request.headers['idempotency-key'];
    if (typeof header === 'string' && header.length > 0 && header.length <= 200) {
      return header;
    }
    const body = request.body as { idempotencyKey?: unknown } | undefined;
    if (typeof body?.idempotencyKey === 'string' && body.idempotencyKey.length > 0) {
      return body.idempotencyKey;
    }
    return null;
  }

  private hashRequest(request: RequestWithUser): string {
    const body = (request.body ?? {}) as Record<string, unknown>;
    // The key itself is excluded so it does not affect its own comparison.
    const { idempotencyKey: _omit, ...rest } = body;
    return createHash('sha256')
      .update(JSON.stringify({ path: request.path, body: rest }))
      .digest('hex');
  }

  private async lookup(key: string) {
    const record = await this.prisma.client.idempotencyRecord.findUnique({ where: { key } });
    if (!record) return null;
    if (record.expiresAt.getTime() < this.clock.timestamp()) {
      await this.prisma.client.idempotencyRecord
        .delete({ where: { key } })
        .catch(() => undefined);
      return null;
    }
    return record;
  }

  private async store(params: {
    key: string;
    userId: string | null;
    endpoint: string;
    requestHash: string;
    statusCode: number;
    body: unknown;
  }): Promise<void> {
    await this.prisma.client.idempotencyRecord
      .create({
        data: {
          key: params.key,
          userId: params.userId,
          endpoint: params.endpoint,
          requestHash: params.requestHash,
          statusCode: params.statusCode,
          response: (params.body ?? {}) as object,
          expiresAt: this.clock.plusSeconds(RETENTION_HOURS * 60 * 60),
        },
      })
      // A concurrent duplicate loses the race on the unique key; the winner's
      // response is already stored, so there is nothing to repair.
      .catch(() => undefined);
  }
}
