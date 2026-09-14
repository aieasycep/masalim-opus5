import type { AssetKind, AssetVisibility } from '@masalim/types';

export interface SignedUpload {
  /** URL the client PUTs the file to. */
  url: string;
  /** Headers the client must send verbatim for the signature to validate. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string;
  lastModified: Date;
}

export interface CreateSignedUploadParams {
  key: string;
  contentType: string;
  sizeBytes: number;
  ttlSeconds: number;
}

export interface PutObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
  visibility?: AssetVisibility;
}

/**
 * Object storage abstraction.
 *
 * Implemented by the local-disk driver used in development and the
 * S3-compatible driver used with Cloudflare R2, AWS S3, MinIO or Supabase
 * Storage. Business logic never imports a vendor SDK.
 */
export interface StorageProvider {
  readonly name: string;

  /** Hand the client a short-lived URL so uploads never proxy through the API. */
  createSignedUploadUrl(params: CreateSignedUploadParams): Promise<SignedUpload>;

  /** Short-lived read URL for private media. */
  createSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;

  /** Stable URL for objects explicitly marked public (system voice previews). */
  getPublicUrl(key: string): string;

  putObject(params: PutObjectParams): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<ObjectMetadata | null>;
}

/**
 * Object keys.
 *
 * A cuid segment makes keys unguessable, so even a leaked bucket listing does
 * not let one family reach another family's recordings. The owner id is kept in
 * the path purely for operational tidiness — it is never the access check.
 */
export function buildObjectKey(params: {
  kind: AssetKind;
  ownerId: string | null;
  id: string;
  extension: string;
}): string {
  const folder = params.kind.toLowerCase();
  const owner = params.ownerId ?? 'shared';
  const extension = params.extension.startsWith('.')
    ? params.extension
    : `.${params.extension}`;
  return `${folder}/${owner}/${params.id}${extension}`;
}

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? '.bin';
}

export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
