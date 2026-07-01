import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { ShipmentsModule } from '@/shipments/shipments.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionEngineService } from './subscription-engine.service';
import { SubscriptionTickController } from './subscription-tick.controller';
import { SubscriptionTickGuard } from './subscription-tick.guard';
import { SUBSCRIPTION_TRIGGER } from './subscription-trigger.interface';
import { SfnSubscriptionTrigger } from './sfn-subscription-trigger';

// RF01
@Module({
  imports: [AuthModule, ShipmentsModule],
  controllers: [SubscriptionsController, SubscriptionTickController],
  providers: [
    PrismaService,
    SubscriptionsService,
    SubscriptionEngineService,
    SubscriptionTickGuard,
    { provide: SUBSCRIPTION_TRIGGER, useClass: SfnSubscriptionTrigger },
  ],
  exports: [SubscriptionsService, SubscriptionEngineService],
})
export class SubscriptionsModule {}
