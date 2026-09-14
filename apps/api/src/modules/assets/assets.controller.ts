import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  confirmUploadSchema,
  requestUploadSchema,
  type ConfirmUploadInput,
  type RequestUploadInput,
} from '@masalim/validation';
import { ERROR_CODES, type SignedUploadDto } from '@masalim/types';
import {
  isLocalDiskStorage,
  type LocalDiskStorageProvider,
  type StorageProvider,
} from '@masalim/storage';
import { STORAGE_PROVIDER } from '../../core/storage/storage.module';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { CurrentUserId, Public } from '../../core/auth/auth.decorators';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AssetsService } from './assets.service';

@ApiTags('uploads')
@Controller('uploads')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly clock: Clock,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Request a signed upload URL' })
  async requestUpload(
    @CurrentUserId() userId: string,
    @Body(zodBody(requestUploadSchema)) body: RequestUploadInput,
  ): Promise<SignedUploadDto> {
    return this.assets.requestUpload(userId, body);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm a signed upload completed' })
  async confirmUpload(
    @CurrentUserId() userId: string,
    @Body(zodBody(confirmUploadSchema)) body: ConfirmUploadInput,
  ): Promise<{ assetId: string }> {
    return this.assets.confirmUpload(userId, body.assetId);
  }

  /**
   * Local-disk storage endpoint.
   *
   * Only mounted for the development driver. Authorisation comes entirely from
   * the HMAC signature in the query string — the same shape Cloudflare R2 uses —
   * so the development flow exercises signed URLs rather than a shortcut.
   */
  @Public()
  @Put('local')
  @ApiExcludeEndpoint()
  async localUpload(@Req() request: Request, @Res() response: Response): Promise<void> {
    const storage = this.requireLocalStorage();
    const { key, exp, ct, max, sig } = request.query as Record<string, string | undefined>;

    if (!key || !exp || !ct || !max || !sig) {
      throw new AppError(ERROR_CODES.UPLOAD_FAILED, 'Malformed signed upload URL');
    }

    const valid = storage.verifySignature(
      {
        key,
        operation: 'put',
        expiresAt: Number(exp),
        contentType: ct,
        maxBytes: Number(max),
      },
      sig,
      this.clock.now(),
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired upload signature');
    }

    const body = request.body as Buffer;
    if (!Buffer.isBuffer(body)) {
      throw new AppError(ERROR_CODES.UPLOAD_FAILED, 'Expected a binary body');
    }
    if (body.byteLength > Number(max)) {
      throw new AppError(ERROR_CODES.UPLOAD_TOO_LARGE);
    }

    await storage.putObject({ key, body, contentType: ct });
    response.status(200).json({ ok: true });
  }

  @Public()
  @Get('local')
  @ApiExcludeEndpoint()
  async localDownload(@Req() request: Request, @Res() response: Response): Promise<void> {
    const storage = this.requireLocalStorage();
    const { key, exp, sig } = request.query as Record<string, string | undefined>;

    if (!key || !exp || !sig) {
      throw new AppError(ERROR_CODES.ASSET_NOT_FOUND, 'Malformed signed download URL');
    }

    const valid = storage.verifySignature(
      { key, operation: 'get', expiresAt: Number(exp) },
      sig,
      this.clock.now(),
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired download signature');
    }

    const [body, head] = await Promise.all([
      storage.getObject(key),
      storage.headObject(key),
    ]);

    response.setHeader('Content-Type', head?.contentType ?? 'application/octet-stream');
    response.setHeader('Content-Length', String(body.byteLength));
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.status(200).send(body);
  }

  @Public()
  @Get('public/*path')
  @ApiExcludeEndpoint()
  async publicDownload(
    @Query('path') _unused: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const storage = this.requireLocalStorage();
    const key = decodeURIComponent(request.path.replace(/^\/uploads\/public\//, ''));

    const [body, head] = await Promise.all([
      storage.getObject(key),
      storage.headObject(key),
    ]);

    response.setHeader('Content-Type', head?.contentType ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(200).send(body);
  }

  private requireLocalStorage(): LocalDiskStorageProvider {
    if (!isLocalDiskStorage(this.storage)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Local storage endpoints are not enabled');
    }
    return this.storage;
  }
}
