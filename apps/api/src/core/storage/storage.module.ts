import path from 'node:path';
import { Global, Module } from '@nestjs/common';
import { createStorageProvider, type StorageProvider } from '@masalim/storage';
import { AppConfigService } from '../config/config.service';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StorageProvider =>
        createStorageProvider({
          provider: config.get('STORAGE_PROVIDER'),
          bucket: config.get('STORAGE_BUCKET'),
          region: config.get('STORAGE_REGION'),
          accessKey: config.get('STORAGE_ACCESS_KEY'),
          secretKey: config.get('STORAGE_SECRET_KEY'),
          endpoint: config.get('STORAGE_ENDPOINT'),
          publicUrl: config.get('STORAGE_PUBLIC_URL'),
          forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE'),
          localRootDir: path.resolve(process.cwd(), config.get('STORAGE_LOCAL_DIR')),
          apiBaseUrl: config.get('API_BASE_URL'),
          // The local driver signs its URLs; reusing the refresh secret keeps
          // the number of secrets to manage down without weakening either.
          signingSecret: config.get('JWT_REFRESH_SECRET'),
          isProduction: config.isProduction,
        }),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
