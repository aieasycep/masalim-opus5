import { Inject, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  SIGNED_UPLOAD_URL_TTL_SECONDS,
  UPLOAD_CONSTRAINTS,
  type AssetKind,
  type AssetVisibility,
  type SignedUploadDto,
} from '@masalim/types';
import type { RequestUploadInput } from '@masalim/validation';
import {
  buildObjectKey,
  extensionForContentType,
  type StorageProvider,
} from '@masalim/storage';
import { STORAGE_PROVIDER } from '../../core/storage/storage.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/config.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';

@Injectable()
export class AssetsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
  ) {}

  /**
   * Issues a signed upload URL and records the asset up front.
   *
   * Recording the row first means an abandoned upload is a row with no
   * `uploadedAt`, which the retention job can sweep — rather than an orphaned
   * object nobody knows about.
   */
  async requestUpload(userId: string, input: RequestUploadInput): Promise<SignedUploadDto> {
    const asset = await this.prisma.client.asset.create({
      data: {
        userId,
        kind: input.kind,
        bucket: this.config.get('STORAGE_BUCKET'),
        // Placeholder; replaced below now that the generated id is known.
        key: `pending/${userId}/${Date.now()}`,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        visibility: 'PRIVATE',
      },
    });

    const key = buildObjectKey({
      kind: input.kind,
      ownerId: userId,
      id: asset.id,
      extension: extensionForContentType(input.contentType),
    });

    await this.prisma.client.asset.update({ where: { id: asset.id }, data: { key } });

    const upload = await this.storage.createSignedUploadUrl({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      ttlSeconds: SIGNED_UPLOAD_URL_TTL_SECONDS,
    });

    return {
      assetId: asset.id,
      uploadUrl: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      kind: input.kind,
    };
  }

  /**
   * Confirms an upload landed.
   *
   * The declared size is re-checked against what is actually in the bucket, so
   * a client cannot request a URL for a small file and store a huge one.
   */
  async confirmUpload(userId: string, assetId: string): Promise<{ assetId: string }> {
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId || asset.deletedAt) {
      throw new AppError(ERROR_CODES.ASSET_NOT_FOUND);
    }

    const head = await this.storage.headObject(asset.key);
    if (!head) {
      throw new AppError(ERROR_CODES.UPLOAD_FAILED, 'Uploaded object not found in storage');
    }

    const constraint = UPLOAD_CONSTRAINTS[asset.kind];
    if (head.sizeBytes > constraint.maxBytes) {
      await this.storage.deleteObject(asset.key).catch(() => undefined);
      await this.prisma.client.asset.update({
        where: { id: asset.id },
        data: { deletedAt: this.clock.now() },
      });
      throw new AppError(ERROR_CODES.UPLOAD_TOO_LARGE);
    }

    await this.prisma.client.asset.update({
      where: { id: asset.id },
      data: { uploadedAt: this.clock.now(), sizeBytes: head.sizeBytes },
    });

    return { assetId: asset.id };
  }

  /** Registers an object the backend produced itself (narration, illustration). */
  async createInternalAsset(params: {
    userId: string | null;
    kind: AssetKind;
    body: Buffer;
    contentType: string;
    visibility?: AssetVisibility;
  }): Promise<{ id: string; key: string }> {
    const asset = await this.prisma.client.asset.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        bucket: this.config.get('STORAGE_BUCKET'),
        key: `pending/${Date.now()}`,
        contentType: params.contentType,
        sizeBytes: params.body.byteLength,
        visibility: params.visibility ?? 'PRIVATE',
      },
    });

    const key = buildObjectKey({
      kind: params.kind,
      ownerId: params.userId,
      id: asset.id,
      extension: extensionForContentType(params.contentType),
    });

    await this.storage.putObject({
      key,
      body: params.body,
      contentType: params.contentType,
      ...(params.visibility ? { visibility: params.visibility } : {}),
    });

    await this.prisma.client.asset.update({
      where: { id: asset.id },
      data: { key, uploadedAt: this.clock.now() },
    });

    return { id: asset.id, key };
  }

  async readAsset(assetId: string): Promise<Buffer> {
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt) {
      throw new AppError(ERROR_CODES.ASSET_NOT_FOUND);
    }
    return this.storage.getObject(asset.key);
  }

  /**
   * Short-lived URL for private media.
   *
   * Returns null rather than throwing so a list endpoint with one missing
   * illustration still renders instead of failing wholesale.
   */
  async signedUrlForAsset(assetId: string | null, ttlSeconds?: number): Promise<string | null> {
    if (!assetId) return null;
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt) return null;

    if (asset.visibility === 'PUBLIC') {
      return this.storage.getPublicUrl(asset.key);
    }
    return this.storage.createSignedDownloadUrl(
      asset.key,
      ttlSeconds ?? this.config.get('SIGNED_URL_TTL_SECONDS'),
    );
  }

  /** Signed URLs for many assets at once, preserving input order. */
  async signedUrlsForAssets(
    assetIds: ReadonlyArray<string | null>,
  ): Promise<Array<string | null>> {
    return Promise.all(assetIds.map((id) => this.signedUrlForAsset(id)));
  }

  async deleteAsset(assetId: string): Promise<void> {
    const asset = await this.prisma.raw.asset.findUnique({ where: { id: assetId } });
    if (!asset) return;
    await this.storage.deleteObject(asset.key).catch(() => undefined);
    await this.prisma.client.asset.update({
      where: { id: assetId },
      data: { deletedAt: this.clock.now() },
    });
  }
}
