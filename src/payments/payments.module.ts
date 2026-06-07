import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { RoutingModule } from '@/routing/routing.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebpayService } from './webpay.service';
import { PaymentAuditService } from './payment-audit.service';

@Module({
  imports: [AuthModule, RoutingModule, ShipmentsModule],
  controllers: [PaymentsController],
  providers: [
    PrismaService,
    PaymentsService,
    WebpayService,
    PaymentAuditService,
  ],
})
export class PaymentsModule {}
