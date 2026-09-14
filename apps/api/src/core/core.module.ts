import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { PolicyService } from './policy/policy.service';
import { TokenService } from './auth/jwt.service';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { EntitlementsService } from './entitlements/entitlements.service';
import { Clock } from './time/clock';

/**
 * Everything cross-cutting, exported once so feature modules stay thin.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    JwtModule.register({}),
  ],
  providers: [Clock, PolicyService, TokenService, RateLimitService, EntitlementsService],
  exports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    JwtModule,
    Clock,
    PolicyService,
    TokenService,
    RateLimitService,
    EntitlementsService,
  ],
})
export class CoreModule {}
