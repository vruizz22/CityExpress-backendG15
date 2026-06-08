import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutingModule } from '@/routing/routing.module';
import { RoutesModule } from '@/routes/routes.module';
import { JobsModule } from '@/jobs/jobs.module';
import { AuthModule } from '@/auth/auth.module';
import { RoutingCalcModule } from '@/routing-calc/routing-calc.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { PaymentsModule } from '@/payments/payments.module';
import { DevSeedModule } from '@/dev/dev-seed.module';

@Module({
  imports: [
    PackagesModule,
    RoutingModule,
    RoutesModule,
    JobsModule,
    AuthModule,
    RoutingCalcModule,
    ShipmentsModule,
    PaymentsModule,
    DevSeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
