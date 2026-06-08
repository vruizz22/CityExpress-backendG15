/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { MESSAGE_BROKER } from '@/messaging/message-broker.interface';
import { NoopMessageBrokerService } from '@/messaging/noop-message-broker.service';
import { AuditService } from '@/routing/audit.service';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageService } from '@/routing/package.service';
import { PendingPackagesRepository } from '@/routing/pending-packages.repository';
import {
  NoopPackageDeliveryService,
  PackageDeliveryService,
} from '@/routing/package-delivery.service';
import { RoutingSubscriberService } from '@/routing/routing-subscriber.service';
import { RoutingOrchestratorService } from '@/routing/routing-orchestrator.service';

@Module({
  providers: [
    PrismaService,
    DistanceTableService,
    AuditService,
    PackageEventsRepository,
    PendingPackagesRepository,
    PackageService,
    RoutingSubscriberService,
    RoutingOrchestratorService,
    {
      provide: MESSAGE_BROKER,
      useFactory: async () => {
        if (process.env.USE_AMQP === 'true') {
          const mod = await import('../messaging/amqp-message-broker.service');
          const { AmqpMessageBrokerService } = mod as any;
          return new AmqpMessageBrokerService();
        }
        return new NoopMessageBrokerService();
      },
    },
    { provide: PackageDeliveryService, useClass: NoopPackageDeliveryService },
  ],
  exports: [PackageService, DistanceTableService, AuditService, MESSAGE_BROKER],
})
export class RoutingModule {}
