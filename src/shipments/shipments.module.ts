import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { RoutingCalcModule } from '@/routing-calc/routing-calc.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import {
  INITIAL_SHIPMENT_SERVICE,
  StubInitialShipmentService,
} from './initial-shipment.interface';

@Module({
  imports: [AuthModule, RoutingCalcModule],
  controllers: [ShipmentsController],
  providers: [
    PrismaService,
    ShipmentsService,
    { provide: INITIAL_SHIPMENT_SERVICE, useClass: StubInitialShipmentService },
  ],
  exports: [INITIAL_SHIPMENT_SERVICE, ShipmentsService],
})
export class ShipmentsModule {}
