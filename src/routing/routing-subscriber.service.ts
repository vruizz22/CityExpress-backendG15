import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CENTRAL_ID, CITY_ID, cityRoutingKey } from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import {
  DistanceTableMessageSchema,
  DistanceTableRequestSchema,
  MessageEnvelopeSchema,
} from '@/messaging/message.schemas';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageService } from '@/routing/package.service';

@Injectable()
export class RoutingSubscriberService implements OnModuleInit {
  private readonly logger = new Logger(RoutingSubscriberService.name);

  // Dedup anti-loop: descarta mensajes ya procesados (reentregas del broker).
  private readonly seenTtlMs = Number(process.env.MSG_DEDUP_TTL_MS ?? 60000);
  private readonly seen = new Map<string, number>();

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

      if (this.isDuplicate(envelope.data.msgId)) {
        this.logger.debug(
          `Mensaje duplicado descartado: ${envelope.data.msgId}`,
        );
        return;
      }

      const { type } = envelope.data;

      // RF06 — otra ciudad nos pide nuestra tabla de distancias.
      if (type === 'request') {
        const req = DistanceTableRequestSchema.safeParse(message);
        if (!req.success) {
          this.logger.warn('Request de distance-table malformado, ignorado.');
          return;
        }
        await this.distanceTable.respondWithOwnTable(req.data.source);
        return;
      }

      // RF06 — tabla de distancias entrante (propia desde central o de un peer).
      if (type === 'distance-table' || type === 'cost-update') {
        const parsed = DistanceTableMessageSchema.safeParse(message);
        if (!parsed.success) {
          this.logger.warn('cost-update/distance-table malformado, ignorado.');
          return;
        }
        const senderCityId = parsed.data.cityId;
        const distances = parsed.data.data.distances;

        const isOwnTable =
          !senderCityId ||
          senderCityId === CITY_ID ||
          senderCityId === CENTRAL_ID;

        if (isOwnTable) {
          // Nuestra tabla (la manda la central) → aplicar + fanout a las demás.
          this.distanceTable.applyOwnTable(distances);
        } else {
          // Respuesta de otra ciudad → guardar en la matriz + ACK. Sin fanout.
          await this.distanceTable.applyPeerTable(senderCityId, distances);
          await this.distanceTable.sendAck(
            senderCityId,
            parsed.data.idpk ?? '',
            parsed.data.msgId ?? '',
            'ack',
          );
        }

        await this.packageService.processPendingRoutes();
        return;
      }

      // ACK/NACK de tablas: terminales, solo se registran (RNF03).
      if (type === 'ack' || type === 'nack') {
        this.logger.debug(
          `Recibido ${type} de ${envelope.data.cityId ?? 'desconocido'}.`,
        );
        return;
      }

      if (type === 'package-transit') {
        await this.packageService.handlePackageTransit(message);
      }
    });
  }

  /** Dedup por msgId con TTL para descartar reentregas y romper loops. */
  private isDuplicate(msgId: string | undefined): boolean {
    // Sin msgId no podemos deduplicar (p. ej. tablas de la central que no lo
    // envían): se procesa siempre en vez de descartarlo.
    if (!msgId) {
      return false;
    }
    const now = Date.now();
    this.pruneSeen(now);
    if (this.seen.has(msgId)) {
      return true;
    }
    this.seen.set(msgId, now);
    return false;
  }

  private pruneSeen(now: number): void {
    if (this.seen.size < 1000) {
      return;
    }
    for (const [id, ts] of this.seen) {
      if (now - ts > this.seenTtlMs) {
        this.seen.delete(id);
      }
    }
  }
}
