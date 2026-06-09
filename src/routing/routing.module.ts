/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { MESSAGE_BROKER } from '@/messaging/message-broker.interface';
import { NoopMessageBrokerService } from '@/messaging/noop-message-broker.service';
import { RoutingCalcModule } from '@/routing-calc/routing-calc.module';
import { AuditService } from '@/routing/audit.service';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageService } from '@/routing/package.service';
import { PendingPackagesRepository } from '@/routing/pending-packages.repository';
import { RouteRepository } from '@/routing/route.repository';
import {
  NoopPackageDeliveryService,
  PackageDeliveryService,
} from '@/routing/package-delivery.service';
import { RoutingSubscriberService } from '@/routing/routing-subscriber.service';
import { RoutingOrchestratorService } from '@/routing/routing-orchestrator.service';

@Module({
  imports: [RoutingCalcModule],
  providers: [
    PrismaService,
    DistanceTableService,
    AuditService,
    PackageEventsRepository,
    PendingPackagesRepository,
    RouteRepository,
    PackageService,
    RoutingSubscriberService,
    RoutingOrchestratorService,
    {
      provide: MESSAGE_BROKER,
      useFactory: async () => {
        // Conecta al broker si hay RABBITMQ_URL configurado (USE_AMQP=false lo
        // fuerza apagado). Antes exigía USE_AMQP=true explícito y en prod, si no
        // estaba seteado, el backend nunca recibía la tabla de distancias.
        const useAmqp =
          process.env.USE_AMQP === 'true' ||
          (!!process.env.RABBITMQ_URL && process.env.USE_AMQP !== 'false');
        if (useAmqp) {
          const mod = await import('../messaging/amqp-message-broker.service');
          const { AmqpMessageBrokerService } = mod as any;
          return new AmqpMessageBrokerService();
        }
        return new NoopMessageBrokerService();
      },
    },
    { provide: PackageDeliveryService, useClass: NoopPackageDeliveryService },
  ],
  exports: [
    PackageService,
    DistanceTableService,
    AuditService,
    PackageEventsRepository,
    RouteRepository,
    MESSAGE_BROKER,
  ],
})
export class RoutingModule {}
