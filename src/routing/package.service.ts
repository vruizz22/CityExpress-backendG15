import { Inject, Injectable } from '@nestjs/common';
import { CITY_ID, cityRoutingKey } from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { AckMessage, PackageTransitMessage } from '@/messaging/message.types';
import { createBaseMessage } from '@/messaging/message.factory';
import {
  MessageEnvelopeSchema,
  PackageTransitMessageSchema,
} from '@/messaging/message.schemas';
import { AuditService } from '@/routing/audit.service';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PendingPackagesRepository } from '@/routing/pending-packages.repository';
import { PackageDeliveryService } from '@/routing/package-delivery.service';
import { PackageBody } from '@dto/package.dto';

@Injectable()
export class PackageService {
  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly auditService: AuditService,
    private readonly distanceTable: DistanceTableService,
    private readonly packageEvents: PackageEventsRepository,
    private readonly pendingRepository: PendingPackagesRepository,
    private readonly deliveryService: PackageDeliveryService,
  ) {}

  async handlePackageTransit(message: unknown, now: Date = new Date()) {
    const envelope = MessageEnvelopeSchema.safeParse(message);
    if (!envelope.success) {
      throw new Error('Invalid message envelope.');
    }
    if (envelope.data.type !== 'package-transit') {
      return;
    }

    const parsed = PackageTransitMessageSchema.safeParse(message);
    const senderCityId = envelope.data.cityId ?? null;
    if (!parsed.success) {
      if (!senderCityId) {
        throw new Error('Missing sender cityId for ACK/NACK.');
      }
      await this.sendAck(
        senderCityId,
        envelope.data.idpk,
        envelope.data.msgId,
        'nack',
      );
      return;
    }

    const payload = parsed.data;
    const resolvedSenderCityId =
      payload.cityId ?? payload.packageBody.originId ?? senderCityId;
    if (!resolvedSenderCityId) {
      throw new Error('Missing sender cityId for ACK/NACK.');
    }

    const normalizedPayload: PackageTransitMessage = payload.cityId
      ? payload
      : { ...payload, cityId: resolvedSenderCityId };

    const recordResult = await this.packageEvents.recordInbound(
      normalizedPayload,
      resolvedSenderCityId,
    );
    await this.sendAck(
      resolvedSenderCityId,
      normalizedPayload.idpk,
      normalizedPayload.msgId,
      'ack',
    );
    if (recordResult === 'duplicate') {
      return;
    }

    const pkg = normalizedPayload.packageBody;
    if (pkg.destinationId === CITY_ID) {
      await this.auditService.reportReceived(pkg.id);
      const deliverNotBefore = this.parseOptionalDate(pkg.deliverNotBefore);
      if (deliverNotBefore && deliverNotBefore > now) {
        await this.pendingRepository.savePendingDelivery(normalizedPayload);
        return;
      }
      await this.deliveryService.deliver(pkg);
      await this.auditService.reportDelivered(pkg.id);
      return;
    }

    if (pkg.maxHops <= 0) {
      await this.auditService.reportExpired(pkg.id);
      return;
    }

    const forwardedPackage = {
      ...pkg,
      maxHops: pkg.maxHops - 1,
    };

    const constraints = pkg.constraints as Record<string, unknown> | undefined;
    const criteria = constraints?.criteria === 'price' ? 'price' : 'distance';

    const nextCityId = this.distanceTable.getNextHop(
      pkg.destinationId,
      criteria,
    );

    if (!nextCityId) {
      await this.pendingRepository.savePendingRoute(normalizedPayload);
      return;
    }

    await this.sendPackage(nextCityId, forwardedPackage);

    if (nextCityId === pkg.destinationId) {
      await this.auditService.reportTransit(pkg.id, pkg.destinationId);
    } else {
      await this.auditService.reportTransitRedirect(pkg.id, nextCityId);
    }
  }

  async processPendingDeliveries(now: Date = new Date()): Promise<void> {
    const pending =
      await this.pendingRepository.findPendingDeliveriesReady(now);
    for (const record of pending) {
      const deliverNotBefore = record.deliverNotBefore ?? null;
      if (deliverNotBefore && deliverNotBefore > now) {
        continue;
      }
      await this.deliveryService.deliver(this.toPackageBody(record));
      await this.auditService.reportDelivered(record.packageId);
      await this.pendingRepository.removePending(record.idpk);
    }
  }

  async processPendingRoutes(): Promise<void> {
    const pending = await this.pendingRepository.findPendingRoutes();
    for (const record of pending) {
      const pkg = this.toPackageBody(record);
      if (pkg.maxHops <= 0) {
        await this.auditService.reportExpired(pkg.id);
        await this.pendingRepository.removePending(record.idpk);
        continue;
      }

      const forwardedPackage = { ...pkg, maxHops: pkg.maxHops - 1 };

      // --- NUEVA LÓGICA DE RUTEO POR CRITERIO (Para paquetes pendientes) ---
      const constraints = pkg.constraints as
        | Record<string, unknown>
        | undefined;
      const criteria = constraints?.criteria === 'price' ? 'price' : 'distance';

      const nextCityId = this.distanceTable.getNextHop(
        pkg.destinationId,
        criteria,
      );

      if (!nextCityId) {
        continue; // Sigue pendiente si aún no hay ruta
      }

      await this.sendPackage(nextCityId, forwardedPackage);

      if (nextCityId === pkg.destinationId) {
        await this.auditService.reportTransit(pkg.id, pkg.destinationId);
      } else {
        await this.auditService.reportTransitRedirect(pkg.id, nextCityId);
      }

      await this.pendingRepository.removePending(record.idpk);
    }
  }

  private async sendPackage(
    destinationCityId: string,
    packageBody: PackageBody,
  ): Promise<void> {
    const base = createBaseMessage('package-transit');
    const message: PackageTransitMessage = {
      ...base,
      type: 'package-transit',
      packageBody,
    };
    await this.broker.send(cityRoutingKey(destinationCityId), message);
  }

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

  private parseOptionalDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private toPackageBody(record: {
    packageId: string;
    deliveryStrategy: string;
    maxHops: number;
    createdAt: Date;
    deliverNotBefore: Date | null;
    originId: string;
    destinationId: string;
    metaContent: string | null;
    isMetaEncrypted: boolean;
    constraints: unknown;
    priorityClass: string;
    payment: number;
  }): PackageBody {
    return {
      id: record.packageId,
      deliveryStrategy: record.deliveryStrategy,
      maxHops: record.maxHops,
      createdAt: record.createdAt.toISOString(),
      deliverNotBefore: record.deliverNotBefore?.toISOString() ?? null,
      originId: record.originId,
      destinationId: record.destinationId,
      metaContent: record.metaContent ?? null,
      isMetaEncrypted: record.isMetaEncrypted,
      constraints:
        record.constraints && typeof record.constraints === 'object'
          ? (record.constraints as Record<string, unknown>)
          : {},
      priorityClass: record.priorityClass,
      payment: record.payment,
    };
  }
}
