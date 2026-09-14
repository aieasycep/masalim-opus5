import { Global, Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/**
 * Global because nearly every feature needs to turn an asset id into a signed
 * URL when serialising a response.
 */
@Global()
@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
