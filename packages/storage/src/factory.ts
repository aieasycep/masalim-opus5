import { LocalDiskStorageProvider } from './local-disk';
import { S3StorageProvider } from './s3';
import type { StorageProvider } from './types';

export const STORAGE_PROVIDERS = ['local', 's3'] as const;
export type StorageProviderName = (typeof STORAGE_PROVIDERS)[number];

export interface StorageFactoryConfig {
  provider: StorageProviderName;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string | undefined;
  publicUrl?: string | undefined;
  forcePathStyle: boolean;
  /** Where the local driver writes objects. */
  localRootDir: string;
  /** Base URL of the API, used by the local driver's signed URLs. */
  apiBaseUrl: string;
  /** Secret the local driver signs URLs with. */
  signingSecret: string;
  isProduction: boolean;
}

/**
 * Resolves the configured storage driver.
 *
 * The local-disk driver is a development convenience and is refused outright in
 * production, so a misconfigured deployment fails at boot rather than silently
 * writing a family's recordings to a container filesystem that disappears on
 * the next restart.
 */
export function createStorageProvider(config: StorageFactoryConfig): StorageProvider {
  if (config.provider === 'local') {
    if (config.isProduction) {
      throw new Error(
        'STORAGE_PROVIDER=local is not allowed in production. Configure S3-compatible storage (Cloudflare R2).',
      );
    }
    return new LocalDiskStorageProvider({
      rootDir: config.localRootDir,
      publicBaseUrl: config.apiBaseUrl,
      signingSecret: config.signingSecret,
    });
  }

  if (!config.accessKey || !config.secretKey) {
    throw new Error('STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY are required for S3 storage.');
  }

  return new S3StorageProvider({
    bucket: config.bucket,
    region: config.region,
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.publicUrl ? { publicBaseUrl: config.publicUrl } : {}),
    forcePathStyle: config.forcePathStyle,
  });
}
