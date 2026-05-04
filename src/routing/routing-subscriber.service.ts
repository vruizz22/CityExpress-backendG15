import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CITY_ID, cityRoutingKey } from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { MessageEnvelopeSchema } from '@/messaging/message.schemas';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageService } from '@/routing/package.service';

@Injectable()
export class RoutingSubscriberService implements OnModuleInit {
  private readonly logger = new Logger(RoutingSubscriberService.name);

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly packageService: PackageService,
    private readonly distanceTable: DistanceTableService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.broker.subscribe(cityRoutingKey(CITY_ID), async (message) => {
      this.logger.debug(`Incoming raw: ${JSON.stringify(message)}`);
      const envelope = MessageEnvelopeSchema.safeParse(message);
      if (!envelope.success) {
        this.logger.warn(
          `Envelope parse failed: ${JSON.stringify(envelope.error.issues)}`,
        );
        return;
      }

      this.logger.debug(`Routed type=${envelope.data.type}`);

      if (envelope.data.type === 'distance-table') {
        await this.distanceTable.updateFromMessage(message);
        await this.packageService.processPendingRoutes();
        return;
      }

      if (envelope.data.type === 'package-transit') {
        await this.packageService.handlePackageTransit(message);
      }
    });
  }
}
