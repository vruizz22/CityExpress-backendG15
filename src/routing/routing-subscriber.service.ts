import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CENTRAL_ID,
  CITY_ID,
  cityRoutingKey,
  sameCity,
} from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import {
  DistanceTableMessageSchema,
  DistanceTableRequestSchema,
  MessageEnvelopeSchema,
  PackageStatusMessageSchema,
} from '@/messaging/message.schemas';
import { AckMessage } from '@/messaging/message.types';
import { DistanceTableService } from '@/routing/distance-table.service';
import { InsuranceService } from '@/routing/insurance.service';
import { PackageService } from '@/routing/package.service';

/** Coacciona a string solo valores escalares; el resto a un placeholder. */
function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value == null ? '-' : '?';
}

/** Resumen compacto de un mensaje entrante (sin serializar el payload entero). */
function summarizeMessage(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return scalar(message);
  }
  const m = message as {
    type?: unknown;
    cityId?: unknown;
    source?: unknown;
    msgId?: unknown;
  };
  const city = m.cityId ?? m.source;
  return `type=${scalar(m.type)} city=${scalar(city)} msg=${scalar(m.msgId)}`;
}

@Injectable()
export class RoutingSubscriberService implements OnModuleInit {
  private readonly logger = new Logger(RoutingSubscriberService.name);

  // Dedup anti-loop: descarta mensajes ya procesados (reentregas del broker).
  private readonly seenTtlMs = Number(process.env.MSG_DEDUP_TTL_MS ?? 60000);
  // Tope duro: si la tormenta entra más rápido que el TTL, el dedup por tiempo no
  // alcanza a podar y el Map crecería sin límite (cada msgId es único) → fuga de
  // memoria. Con el tope evictamos los más viejos (Map preserva orden de inserción).
  private readonly seenMax = Number(process.env.MSG_DEDUP_MAX ?? 5000);
  private readonly seen = new Map<string, number>();

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly packageService: PackageService,
    private readonly distanceTable: DistanceTableService,
    private readonly insurance: InsuranceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.broker.subscribe(cityRoutingKey(CITY_ID), async (message) => {
      // Resumen barato por defecto. Serializar el payload completo (las tablas
      // de distancias son enormes) en CADA mensaje satura RAM/CPU/disco bajo la
      // tormenta de cost-updates. El payload completo solo con LOG_RAW_MESSAGES.
      this.logger.debug(`Incoming: ${summarizeMessage(message)}`);
      if (process.env.LOG_RAW_MESSAGES === 'true') {
        this.logger.debug(`Incoming raw: ${JSON.stringify(message)}`);
      }
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
          sameCity(senderCityId, CITY_ID) ||
          sameCity(senderCityId, CENTRAL_ID);

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

      // RF02 (E3) — somos la ciudad ORIGEN de un asegurado no entregable:
      // ACK al emisor y cobro idempotente del seguro.
      if (type === 'package-status') {
        await this.handlePackageStatus(message, envelope.data);
        return;
      }

      if (type === 'package-transit') {
        await this.packageService.handlePackageTransit(message);
      }
    });
  }

  private async handlePackageStatus(
    message: unknown,
    envelope: { idpk?: string; msgId?: string; cityId?: string },
  ): Promise<void> {
    const parsed = PackageStatusMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.logger.warn('package-status malformado.');
      if (envelope.cityId) {
        await this.sendAck(
          envelope.cityId,
          envelope.idpk ?? '',
          envelope.msgId ?? '',
          'nack',
        );
      }
      return;
    }

    const sender = parsed.data.cityId;
    if (sender && !sameCity(sender, CITY_ID)) {
      await this.sendAck(sender, parsed.data.idpk, parsed.data.msgId, 'ack');
    }

    if (parsed.data.data.status !== 'expired') {
      this.logger.debug(
        `package-status "${parsed.data.data.status}" ignorado (solo expired cobra seguro).`,
      );
      return;
    }

    await this.insurance.chargeInsurance(
      parsed.data.data.pkgId,
      parsed.data.data.reason ?? 'expired',
    );
  }

  /** ACK/NACK con el idpk/msgId ORIGINALES del mensaje (regla E1). */
  private async sendAck(
    destinationCityId: string,
    idpk: string,
    msgId: string,
    type: 'ack' | 'nack',
  ): Promise<void> {
    const ack: AckMessage = {
      idpk,
      msgId,
      type,
      timestamp: new Date().toISOString(),
      cityId: CITY_ID,
    };
    await this.broker.send(cityRoutingKey(destinationCityId), ack);
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
    // 1) Poda por TTL (reentregas viejas).
    if (this.seen.size >= 1000) {
      for (const [id, ts] of this.seen) {
        if (now - ts > this.seenTtlMs) {
          this.seen.delete(id);
        }
      }
    }
    // 2) Tope duro: si aún excede (tormenta más rápida que el TTL), evicta los
    //    más antiguos hasta volver al máximo. Evita la fuga de memoria del Map.
    if (this.seen.size > this.seenMax) {
      let toEvict = this.seen.size - this.seenMax;
      for (const id of this.seen.keys()) {
        if (toEvict-- <= 0) break;
        this.seen.delete(id);
      }
    }
  }
}
