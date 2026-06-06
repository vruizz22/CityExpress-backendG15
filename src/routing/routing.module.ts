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

@Module({
  providers: [
    PrismaService,
    DistanceTableService,
    AuditService,
    PackageEventsRepository,
    PendingPackagesRepository,
    PackageService,
    RoutingSubscriberService,
    {
      provide: MESSAGE_BROKER,
      useFactory: () => {
        if (process.env.USE_AMQP === 'true') {
          // require lazily to avoid static TS import resolution during tests
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { AmqpMessageBrokerService } = require('../messaging/amqp-message-broker.service');
          return new AmqpMessageBrokerService();
        }
        return new NoopMessageBrokerService();
      },
    },
    { provide: PackageDeliveryService, useClass: NoopPackageDeliveryService },
  ],
  exports: [PackageService, DistanceTableService, AuditService],
})
export class RoutingModule {}
