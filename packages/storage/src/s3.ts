import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  CreateSignedUploadParams,
  ObjectMetadata,
  PutObjectParams,
  SignedUpload,
  StorageProvider,
} from './types';
import { StorageObjectNotFoundError } from './types';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Custom endpoint. Required for Cloudflare R2, MinIO and Supabase Storage;
   * omit for AWS S3 proper.
   */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** CDN or custom-domain base URL used for objects marked public. */
  publicBaseUrl?: string;
}

/**
 * S3-compatible storage driver.
 *
 * One implementation covers Cloudflare R2 (the production choice), AWS S3,
 * MinIO and Supabase Storage — only the endpoint and credentials differ.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | undefined;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, '');
    this.client = new S3Client({
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
    });
  }

  async createSignedUploadUrl(params: CreateSignedUploadParams): Promise<SignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      // Binding the length into the signature stops a client from requesting a
      // URL for a small file and then uploading a huge one.
      ContentLength: params.sizeBytes,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: params.ttlSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return {
      url,
      headers: {
        'content-type': params.contentType,
        'content-length': String(params.sizeBytes),
      },
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000),
    };
  }

  async createSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  getPublicUrl(key: string): string {
    if (!this.publicBaseUrl) {
      throw new Error(
        'STORAGE_PUBLIC_URL is not configured; cannot build a public URL for this object.',
      );
    }
    return `${this.publicBaseUrl}/${key}`;
  }

  async putObject(params: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new StorageObjectNotFoundError(key);
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw error;
      throw new StorageObjectNotFoundError(key);
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        lastModified: response.LastModified ?? new Date(0),
      };
    } catch {
      return null;
    }
  }
}
