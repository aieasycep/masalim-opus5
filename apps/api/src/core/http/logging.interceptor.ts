import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { AppLogger } from '../logger/logger.service';

interface RequestWithContext extends Request {
  requestId?: string;
  user?: { id: string };
}

/** One structured line per completed request, with timing and correlation ids. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.write(request, response.statusCode, startedAt),
        // Failures are logged by the exception filter, which knows the mapped
        // status; logging here as well would double every error line.
        error: () => undefined,
      }),
    );
  }

  private write(request: RequestWithContext, statusCode: number, startedAt: bigint): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.logger
      .child({
        requestId: request.requestId,
        userId: request.user?.id,
      })
      .info(
        {
          method: request.method,
          path: request.route?.path ?? request.originalUrl ?? request.url,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        },
        'request completed',
      );
  }
}
