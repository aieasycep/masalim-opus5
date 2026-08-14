import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { AppExceptionFilter } from './core/errors/exception.filter';
import { JwtAuthGuard } from './core/auth/jwt-auth.guard';
import { EntitlementGuard } from './core/entitlements/entitlement.guard';
import { LoggingInterceptor } from './core/http/logging.interceptor';
import { IdempotencyInterceptor } from './core/idempotency/idempotency.interceptor';
import { RequestContextMiddleware } from './core/http/request-context.middleware';
import { QueueModule } from './core/queue/queue.module';
import { AiModule } from './core/ai/ai.module';
import { CommerceModule } from './core/commerce/commerce.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { BooksModule } from './modules/books/books.module';
import { ChildrenModule } from './modules/children/children.module';
import { HealthModule } from './modules/health/health.module';
import { IllustrationsModule } from './modules/illustrations/illustrations.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NarrationModule } from './modules/narration/narration.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StoriesModule } from './modules/stories/stories.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsersModule } from './modules/users/users.module';
import { VoicesModule } from './modules/voices/voices.module';

@Module({
  imports: [
    CoreModule,
    QueueModule,
    AiModule,
    CommerceModule,
    AssetsModule,
    ModerationModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ChildrenModule,
    StoriesModule,
    VoicesModule,
    NarrationModule,
    IllustrationsModule,
    BooksModule,
    SubscriptionsModule,
    AddressesModule,
    OrdersModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    // Authentication runs first so the entitlement guard can see the user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EntitlementGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
