import { loadEnvironment } from './bootstrap';

loadEnvironment();
// The worker host only starts its BullMQ workers when this role is set, so the
// HTTP process never picks up jobs even though it shares the same module graph.
process.env.MASALIM_ROLE = 'worker';

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './core/config/config.service';
import { AppLogger } from './core/logger/logger.service';

async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const logger = context.get(AppLogger);
  const config = context.get(AppConfigService);
  context.useLogger(logger);
  context.enableShutdownHooks();

  logger.pino.info(
    { environment: config.get('APP_ENV') },
    'Masalım worker started',
  );
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start Masalım worker:', error);
  process.exit(1);
});
