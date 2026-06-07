import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutesModule } from '@routes/routes.module';
import { AuditModule } from '@audit/audit.module';
import { RoutingModule } from '@/routing/routing.module';
import { AuthModule } from '@/auth/auth.module';
import { RoutingCalcModule } from '@/routing-calc/routing-calc.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { PaymentsModule } from '@/payments/payments.module';

@Module({
  imports: [
    PackagesModule,
    RoutesModule,
    AuditModule,
    RoutingModule,
    AuthModule,
    RoutingCalcModule,
    ShipmentsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
