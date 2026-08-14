import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [AddressesModule],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentsService, PricingService],
  exports: [OrdersService, PricingService],
})
export class OrdersModule {}
