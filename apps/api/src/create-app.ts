import { json, raw, urlencoded } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfigService } from './core/config/config.service';
import { AppLogger } from './core/logger/logger.service';
import { setupOpenApi } from './openapi';

export interface CreateAppOptions {
  /** Skip the OpenAPI document in tests, where it is pure overhead. */
  withOpenApi?: boolean;
}

/**
 * Builds the HTTP application.
 *
 * Shared by `main.ts` and the integration tests so the suite exercises the same
 * middleware, guards and filters that run in production — a test that bypasses
 * the auth guard proves nothing about the auth guard.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.use(
    helmet({
      // The API serves JSON and signed media, never HTML pages, so CSP would
      // only interfere with the Swagger UI.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origins = config.corsOrigins;
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replay'],
  });

  // The local-storage upload endpoint receives a raw binary PUT; everything else
  // is JSON. Ordering matters — the raw parser must be registered first.
  app.use('/uploads/local', raw({ type: '*/*', limit: '400mb' }));
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // Rate limiting and IP hashing depend on the real client address, which sits
  // behind the load balancer's X-Forwarded-For.
  app.set('trust proxy', 1);


  if (options.withOpenApi ?? true) {
    setupOpenApi(app);
  }

  app.enableShutdownHooks();
  return app;
}
