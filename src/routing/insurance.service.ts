import { Inject, Injectable, Logger } from '@nestjs/common';
import { CITY_ID, cityRoutingKey, sameCity } from '@/config/city.config';
import { EventsService } from '@/events/events.service';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { createBaseMessage } from '@/messaging/message.factory';
import { PackageStatusMessage } from '@/messaging/message.types';
import { PrismaService } from '@/prisma.service';
import { isInsured } from '@/routing/insurance.util';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageBody } from '@dto/package.dto';

/**
 * RF02 (E3) — Seguros. Cuando un paquete ASEGURADO no puede entregarse, la
 * ciudad tenedora emite `package-status: expired` (con reason) a la ciudad de
 * ORIGEN, y el origen gatilla el cobro del seguro exactamente una vez.
 *
 * Anti-loops/idempotencia: claims determinísticos en PackageEvent
 * (`pkg-status:<pkgId>` para notificar una sola vez, `insurance:<pkgId>` para
 * cobrar una sola vez) + si somos el origen cobramos directo sin pasar por el
 * broker (no nos auto-enviamos mensajes).
 *
 * Alcance del "cobro" (tradeoff en plan_e3_victor.md §1.2c): registro
 * idempotente + estado `expired-insured` en los envíos + evento SSE. No muta
 * budget/ledger de suscripciones (contabilidad del motor de ticks).
 */
@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly packageEvents: PackageEventsRepository,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Llamar cuando un paquete muere en nuestra ciudad (maxHops agotados). */
  async handleUndeliverable(pkg: PackageBody, reason: string): Promise<void> {
    if (!isInsured(pkg)) {
      return;
    }

    const claim = await this.packageEvents.claim('pkg-status', pkg, CITY_ID);
    if (claim === 'duplicate') {
      return;
    }

    if (sameCity(pkg.originId, CITY_ID)) {
      // Somos el origen: cobro directo, sin mensaje a nosotros mismos.
      await this.chargeInsurance(pkg.id, reason);
      return;
    }

    const base = createBaseMessage('package-status');
    const message: PackageStatusMessage = {
      ...base,
      type: 'package-status',
      data: { pkgId: pkg.id, status: 'expired', reason },
    };
    await this.broker.send(cityRoutingKey(pkg.originId), message);
    this.logger.log(
      `package-status expired de ${pkg.id} notificado a ${pkg.originId} (${reason}).`,
    );
  }

  /** Cobro del seguro en la ciudad ORIGEN (idempotente por paquete). */
  async chargeInsurance(pkgId: string, reason: string): Promise<void> {
    const claim = await this.packageEvents.claim(
      'insurance',
      this.claimBody(pkgId, reason),
      CITY_ID,
    );
    if (claim === 'duplicate') {
      this.logger.debug(`Seguro de ${pkgId} ya cobrado, se omite.`);
      return;
    }

    // La UI ("qué pasó con mis paquetes") lo refleja vía estado del envío.
    await this.prisma.userShipment.updateMany({
      where: { packageId: pkgId },
      data: { status: 'expired-insured' },
    });
    await this.prisma.subscriptionShipment.updateMany({
      where: { packageId: pkgId },
      data: { status: 'expired-insured', reason },
    });

    // RF04 — feed en vivo.
    this.events.publish({
      type: 'insurance-charged',
      packageId: pkgId,
      status: 'expired-insured',
      reason,
      message: `Seguro cobrado: ${reason}`,
    });
    this.logger.log(`Seguro cobrado para ${pkgId} (${reason}).`);
  }

  /**
   * Cuerpo mínimo para materializar el claim `insurance:<pkgId>` en
   * PackageEvent cuando solo tenemos pkgId/reason (package-status entrante).
   * No viaja por el broker; solo persiste la marca idempotente.
   */
  private claimBody(pkgId: string, reason: string): PackageBody {
    return {
      id: pkgId,
      deliveryStrategy: 'n/a',
      maxHops: 0,
      createdAt: new Date().toISOString(),
      deliverNotBefore: null,
      originId: CITY_ID,
      destinationId: CITY_ID,
      metaContent: reason,
      isMetaEncrypted: false,
      constraints: {},
      priorityClass: 'medium',
      payment: 0,
    };
  }
}
