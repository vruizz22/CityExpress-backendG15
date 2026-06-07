import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { MESSAGE_BROKER } from '@/messaging/message-broker.interface';
import { NoopMessageBrokerService } from '@/messaging/noop-message-broker.service';
import { AmqpMessageBrokerService } from '@/messaging/amqp-message-broker.service';
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

const brokerProvider = {
  provide: MESSAGE_BROKER,
  useClass: process.env.RABBITMQ_URL
    ? AmqpMessageBrokerService
    : NoopMessageBrokerService,
};

@Module({
  providers: [
    PrismaService,
    DistanceTableService,
    AuditService,
    PackageEventsRepository,
    PendingPackagesRepository,
    PackageService,
    RoutingSubscriberService,
    brokerProvider,
    { provide: PackageDeliveryService, useClass: NoopPackageDeliveryService },
  ],
  exports: [PackageService, DistanceTableService, AuditService, MESSAGE_BROKER],
})
export class RoutingModule {}
