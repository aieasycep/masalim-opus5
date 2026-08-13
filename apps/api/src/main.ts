import { loadEnvironment } from './bootstrap';

loadEnvironment();

import 'reflect-metadata';
import { createApp } from './create-app';
import { AppConfigService } from './core/config/config.service';
import { AppLogger } from './core/logger/logger.service';

async function main(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

  const port = config.get('API_PORT');
  await app.listen(port, '0.0.0.0');

  logger.pino.info(
    {
      port,
      environment: config.get('APP_ENV'),
      providers: {
        ai: config.get('AI_PROVIDER'),
        moderation: config.get('MODERATION_PROVIDER'),
        image: config.get('IMAGE_PROVIDER'),
        tts: config.get('TTS_PROVIDER'),
        voiceClone: config.get('VOICE_CLONE_PROVIDER'),
        payment: config.get('PAYMENT_PROVIDER'),
        subscription: config.get('SUBSCRIPTION_PROVIDER'),
        storage: config.get('STORAGE_PROVIDER'),
      },
    },
    'Masalım API listening',
  );
}

void main().catch((error: unknown) => {
  // The logger may not exist yet if configuration failed, so this one write goes
  // to stderr directly.
  // eslint-disable-next-line no-console
  console.error('Failed to start Masalım API:', error);
  process.exit(1);
});
