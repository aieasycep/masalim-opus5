import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  createPrismaClient,
  createRawPrismaClient,
  type ExtendedPrismaClient,
  type PrismaClient,
} from '@masalim/database';
import { AppConfigService } from '../config/config.service';

/**
 * Database access.
 *
 * `client` applies the soft-delete filter and is what every request handler
 * should use. `raw` bypasses it and exists only for deletion workers and admin
 * screens that must see removed rows on purpose.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: ExtendedPrismaClient;
  readonly raw: PrismaClient;

  constructor(config: AppConfigService) {
    const options = {
      databaseUrl: config.get('DATABASE_URL'),
      logQueries: config.get('LOG_LEVEL') === 'trace',
    };
    this.client = createPrismaClient(options);
    this.raw = createRawPrismaClient(options);
  }

  async onModuleInit(): Promise<void> {
    await this.raw.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client.$disconnect(), this.raw.$disconnect()]);
  }
}
