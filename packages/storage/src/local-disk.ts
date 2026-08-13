import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateSignedUploadParams,
  ObjectMetadata,
  PutObjectParams,
  SignedUpload,
  StorageProvider,
} from './types';
import { StorageObjectNotFoundError } from './types';

export interface LocalDiskStorageOptions {
  /** Directory objects are written to. */
  rootDir: string;
  /** Base URL of the API that serves the signing endpoints. */
  publicBaseUrl: string;
  /** Secret used to sign local URLs. */
  signingSecret: string;
}

export interface LocalSignatureClaims {
  key: string;
  operation: 'put' | 'get';
  expiresAt: number;
  contentType?: string;
  maxBytes?: number;
}

/**
 * Development storage driver.
 *
 * Objects live on disk, but URLs are still HMAC-signed and time-limited and the
 * client still PUTs to a URL rather than posting through the API. That keeps the
 * development flow identical in shape to Cloudflare R2, so signed-URL bugs
 * surface locally instead of in production.
 */
export class LocalDiskStorageProvider implements StorageProvider {
  readonly name = 'local';

  private readonly rootDir: string;
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;

  constructor(options: LocalDiskStorageOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    this.signingSecret = options.signingSecret;
  }

  /**
   * Resolve a key to an absolute path, refusing anything that escapes the root.
   * Without this an attacker-supplied key like `../../etc/passwd` would be a
   * path traversal straight out of the storage directory.
   */
  private resolvePath(key: string): string {
    if (key.includes('\0')) {
      throw new Error('Invalid storage key');
    }
    const target = path.resolve(this.rootDir, key);
    const rootWithSep = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : this.rootDir + path.sep;
    if (target !== this.rootDir && !target.startsWith(rootWithSep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  private sign(claims: LocalSignatureClaims): string {
    const payload = [
      claims.key,
      claims.operation,
      String(claims.expiresAt),
      claims.contentType ?? '',
      String(claims.maxBytes ?? ''),
    ].join('\n');
    return createHmac('sha256', this.signingSecret).update(payload).digest('base64url');
  }

  /**
   * Verify a signature from an incoming request. Comparison is constant-time so
   * the signature cannot be recovered by timing the endpoint.
   */
  verifySignature(claims: LocalSignatureClaims, signature: string, now: Date): boolean {
    if (claims.expiresAt < Math.floor(now.getTime() / 1000)) {
      return false;
    }
    const expected = Buffer.from(this.sign(claims));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length) {
      return false;
    }
    return timingSafeEqual(expected, provided);
  }

  async createSignedUploadUrl(params: CreateSignedUploadParams): Promise<SignedUpload> {
    const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000);
    const claims: LocalSignatureClaims = {
      key: params.key,
      operation: 'put',
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      contentType: params.contentType,
      maxBytes: params.sizeBytes,
    };
    const query = new URLSearchParams({
      key: params.key,
      exp: String(claims.expiresAt),
      ct: params.contentType,
      max: String(params.sizeBytes),
      sig: this.sign(claims),
    });

    return {
      url: `${this.publicBaseUrl}/uploads/local?${query.toString()}`,
      headers: { 'content-type': params.contentType },
      expiresAt,
    };
  }

  async createSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Math.floor((Date.now() + ttlSeconds * 1000) / 1000);
    const claims: LocalSignatureClaims = { key, operation: 'get', expiresAt };
    const query = new URLSearchParams({
      key,
      exp: String(expiresAt),
      sig: this.sign(claims),
    });
    return `${this.publicBaseUrl}/uploads/local?${query.toString()}`;
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/uploads/public/${key}`;
  }

  async putObject(params: PutObjectParams): Promise<void> {
    const target = this.resolvePath(params.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, params.body);
    await writeFile(`${target}.meta`, JSON.stringify({ contentType: params.contentType }));
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolvePath(key));
    } catch {
      throw new StorageObjectNotFoundError(key);
    }
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolvePath(key);
    await rm(target, { force: true });
    await rm(`${target}.meta`, { force: true });
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const target = this.resolvePath(key);
    try {
      const stats = await stat(target);
      let contentType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await readFile(`${target}.meta`, 'utf8')) as {
          contentType?: string;
        };
        contentType = meta.contentType ?? contentType;
      } catch {
        // Metadata sidecar is best-effort.
      }
      return {
        key,
        sizeBytes: stats.size,
        contentType,
        lastModified: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}
