import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { RoutingCalcModule } from '@/routing-calc/routing-calc.module';
import { RoutingModule } from '@/routing/routing.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { INITIAL_SHIPMENT_SERVICE } from './initial-shipment.interface';
import { AmqpInitialShipmentService } from './amqp-initial-shipment.service';

@Module({
  imports: [AuthModule, RoutingCalcModule, RoutingModule],
  controllers: [ShipmentsController],
  providers: [
    PrismaService,
    ShipmentsService,
    {
      provide: INITIAL_SHIPMENT_SERVICE,
      useClass: AmqpInitialShipmentService,
    },
  ],
  exports: [INITIAL_SHIPMENT_SERVICE, ShipmentsService],
})
export class ShipmentsModule {}
