import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@masalim/types';
import { Prisma } from '@masalim/database';
import { AppError } from './app-error';
import { AppLogger } from '../logger/logger.service';

interface RequestWithContext extends Request {
  requestId?: string;
  user?: { id: string };
}

/**
 * Turns every thrown value into the single documented error shape.
 *
 * The client only ever receives `{ error: { code, message, requestId } }`, so a
 * Prisma constraint name, a provider stack trace or a moderation category can
 * never reach a parent's screen. The full detail goes to the logs, keyed by the
 * same requestId the user is shown.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithContext>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    const { status, code, message, details, logLevel } = this.classify(exception);

    this.logger.child({
      requestId,
      userId: request.user?.id,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode: status,
      errorCode: code,
      ...(exception instanceof AppError ? exception.logContext : {}),
    })[logLevel](
      {
        err:
          exception instanceof Error
            ? { type: exception.name, message: exception.message, stack: exception.stack }
            : { value: String(exception) },
      },
      message,
    );

    const body: ApiErrorBody = {
      error: {
        code,
        message,
        requestId,
        ...(details ? { details } : {}),
      },
    };

    response.status(status).json(body);
  }

  private classify(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: Array<{ path: string; code: string }>;
    logLevel: 'warn' | 'error';
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
        logLevel: exception.getStatus() >= 500 ? 'error' : 'warn',
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: 'Resource already exists',
          logLevel: 'warn',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ERROR_CODES.NOT_FOUND,
          message: 'Resource not found',
          logLevel: 'warn',
        };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.codeForStatus(status),
        message: exception.message,
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      // Deliberately generic: an unexpected throw must not describe itself to
      // the client.
      message: 'Internal server error',
      logLevel: 'error',
    };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.SERVICE_UNAVAILABLE;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
