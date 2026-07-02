import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { EventsService } from '@/events/events.service';
import {
  INITIAL_SHIPMENT_SERVICE,
  InitialShipmentService,
} from '@/shipments/initial-shipment.interface';
import { PackageBody } from '@dto/package.dto';
import { SubscriptionsService, TickResult } from './subscriptions.service';

// RF01
@Injectable()
export class SubscriptionEngineService {
  private readonly logger = new Logger(SubscriptionEngineService.name);

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    @Inject(INITIAL_SHIPMENT_SERVICE)
    private readonly initialShipment: InitialShipmentService,
  ) {}

  // RF01
  async runTick(
    subscriptionId: string,
    tickNumber: number,
  ): Promise<TickResult> {
    const result = await this.subscriptions.processTick(
      subscriptionId,
      tickNumber,
    );
    if (result.status === 'triggered' && result.shipment) {
      await this.dispatch(subscriptionId, result.shipment.id);
    }
    return result;
  }

  // RF01
  private async dispatch(
    subscriptionId: string,
    subscriptionShipmentId: string,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      return;
    }

    const packageId = randomUUID();
    const packageBody: PackageBody = {
      id: packageId,
      deliveryStrategy: sub.deliveryStrategy,
      maxHops: sub.maxHops,
      createdAt: new Date().toISOString(),
      deliverNotBefore: null,
      originId: sub.originId,
      destinationId: sub.destinationId,
      metaContent: sub.metaContent,
      isMetaEncrypted: false,
      constraints: { criteria: sub.criteria, insured: sub.insured },
      priorityClass: sub.priorityClass,
      payment: sub.pricePerShipment,
    };

    try {
      await this.initialShipment.send(packageBody);
      await this.prisma.subscriptionShipment.update({
        where: { id: subscriptionShipmentId },
        data: { status: 'sent', packageId },
      });
      this.events.publish({
        type: 'package-created',
        packageId,
        origin: sub.originId,
        destination: sub.destinationId,
        amount: sub.pricePerShipment,
        message: `Suscripción: envío a ${sub.destinationId}`,
      });
    } catch (err) {
      this.logger.error(
        `Fallo el despacho del tick (sub ${sub.id})`,
        err as Error,
      );
      await this.prisma.subscriptionShipment.update({
        where: { id: subscriptionShipmentId },
        data: { status: 'failed', packageId, reason: (err as Error).message },
      });
    }
  }
}
