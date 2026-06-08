import { Inject, Injectable, Logger } from '@nestjs/common';
import { CITY_ID, cityRoutingKey } from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { PackageTransitMessage } from '@/messaging/message.types';
import { createBaseMessage } from '@/messaging/message.factory';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageBody } from '@dto/package.dto';
import { InitialShipmentService } from './initial-shipment.interface';

/**
 * RF04 — Tras un pago exitoso construye un `package-transit` compatible con E1
 * y lo envía al siguiente salto óptimo según el criterio del paquete.
 * RNF07 — El envío es idempotente: callbacks Webpay duplicados o reintentos no
 * publican el paquete dos veces.
 */
@Injectable()
export class AmqpInitialShipmentService implements InitialShipmentService {
  private readonly logger = new Logger(AmqpInitialShipmentService.name);

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly distanceTable: DistanceTableService,
    private readonly packageEvents: PackageEventsRepository,
  ) {}

  async send(packageBody: PackageBody): Promise<void> {
    const constraints = packageBody.constraints as
      | Record<string, unknown>
      | undefined;
    const criteria = constraints?.criteria === 'price' ? 'price' : 'distance';

    const nextHop = this.distanceTable.getNextHop(
      packageBody.destinationId,
      criteria,
    );

    if (!nextHop) {
      // Sin ruta: el caller (payments) marca el envío como pending-routing.
      throw new Error(
        `No hay siguiente salto para ${packageBody.destinationId} (criteria=${criteria}).`,
      );
    }

    // RNF07 — claim idempotente ANTES de publicar.
    const claim = await this.packageEvents.recordInitialSent(
      packageBody,
      CITY_ID,
    );
    if (claim === 'duplicate') {
      this.logger.warn(
        `Envío inicial ya realizado para ${packageBody.id}, se omite (idempotencia).`,
      );
      return;
    }

    const base = createBaseMessage('package-transit');
    const message: PackageTransitMessage = {
      ...base,
      type: 'package-transit',
      cityId: CITY_ID,
      packageBody,
    };
    await this.broker.send(cityRoutingKey(nextHop), message);

    this.logger.log(
      `Envío inicial: paquete ${packageBody.id} -> ${nextHop} (destino ${packageBody.destinationId}, criteria ${criteria}).`,
    );
  }
}
