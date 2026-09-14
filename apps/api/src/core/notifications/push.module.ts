import { Global, Module } from '@nestjs/common';
import { createPushProvider, type PushProvider } from '@masalim/notifications';
import { AppConfigService } from '../config/config.service';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

@Global()
@Module({
  providers: [
    {
      provide: PUSH_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PushProvider =>
        createPushProvider({
          isProduction: config.isProduction,
          provider: config.get('PUSH_PROVIDER'),
          expoAccessToken: config.get('EXPO_ACCESS_TOKEN'),
        }),
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
