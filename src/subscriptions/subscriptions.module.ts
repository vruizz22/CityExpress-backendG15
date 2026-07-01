import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionEngineService } from './subscription-engine.service';
import { SubscriptionTickController } from './subscription-tick.controller';
import { SubscriptionTickGuard } from './subscription-tick.guard';
import {
  SUBSCRIPTION_TRIGGER,
  NoopSubscriptionTrigger,
} from './subscription-trigger.interface';

// RF01
@Module({
  imports: [AuthModule, ShipmentsModule],
  controllers: [SubscriptionsController, SubscriptionTickController],
  providers: [
    PrismaService,
    SubscriptionsService,
    SubscriptionEngineService,
    SubscriptionTickGuard,
    { provide: SUBSCRIPTION_TRIGGER, useClass: NoopSubscriptionTrigger },
  ],
  exports: [SubscriptionsService, SubscriptionEngineService],
})
export class SubscriptionsModule {}
