import { Injectable, type LoggerService as NestLoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { AppConfigService } from '../config/config.service';

/**
 * Fields scrubbed from every log line.
 *
 * Voice recordings, payment details and credentials are the crown jewels here,
 * so redaction is centralised rather than left to each call site. Signed URLs
 * are redacted too — the query string is a bearer credential for private media.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.identityToken',
  '*.token',
  '*.tokenHash',
  '*.apiKey',
  '*.secretKey',
  '*.signature',
  '*.cardNumber',
  '*.cvc',
  '*.cvv',
  '*.uploadUrl',
  '*.signedUrl',
  '*.previewUrl',
  '*.audioUrl',
  'authorization',
  'password',
  'accessToken',
  'refreshToken',
  'identityToken',
];

@Injectable()
export class AppLogger implements NestLoggerService {
  private readonly root: Logger;

  constructor(config: AppConfigService) {
    this.root = pino({
      level: config.get('LOG_LEVEL'),
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      base: { env: config.get('APP_ENV') },
      // Pretty output is a development affordance only; production emits JSON
      // for the log pipeline.
      ...(config.get('APP_ENV') === 'development' && !config.isTest
        ? {
            transport: {
              target: 'pino/file',
              options: { destination: 1 },
            },
          }
        : {}),
      // Tests are silent by default, but set MASALIM_TEST_LOGS=1 to see why a
      // request failed instead of guessing from a status code.
      ...(config.isTest && !process.env.MASALIM_TEST_LOGS ? { enabled: false } : {}),
    });
  }

  /** Child logger carrying request-scoped context on every line. */
  child(context: Record<string, unknown>): Logger {
    return this.root.child(context);
  }

  get pino(): Logger {
    return this.root;
  }

  log(message: unknown, context?: string): void {
    this.root.info({ context }, String(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.root.error({ context, stack }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.root.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.root.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.root.trace({ context }, String(message));
  }
}
