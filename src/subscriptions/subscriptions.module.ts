import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

// RF01
@Module({
  imports: [AuthModule, ShipmentsModule],
  controllers: [SubscriptionsController],
  providers: [PrismaService, SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
