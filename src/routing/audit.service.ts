import { Inject, Injectable } from '@nestjs/common';
import { CENTRAL_ID, cityRoutingKey } from '@/config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { createBaseMessage } from '@/messaging/message.factory';
import { AuditEventType, AuditMessage } from '@/messaging/message.types';

@Injectable()
export class AuditService {
  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
  ) {}

  async reportTransit(pkgId: string, nextCityId: string): Promise<void> {
    await this.sendAudit('transit', pkgId, { nextCityId });
  }

  async reportTransitRedirect(
    pkgId: string,
    nextCityId: string,
  ): Promise<void> {
    await this.sendAudit('transit-redirect', pkgId, { nextCityId });
  }

  async reportExpired(pkgId: string): Promise<void> {
    await this.sendAudit('expired', pkgId);
  }

  async reportReceived(pkgId: string): Promise<void> {
    await this.sendAudit('received', pkgId);
  }

  async reportDelivered(pkgId: string): Promise<void> {
    await this.sendAudit('delivered', pkgId);
  }

  private async sendAudit(
    type: AuditEventType,
    pkgId: string,
    data?: { nextCityId: string },
  ): Promise<void> {
    const base = createBaseMessage(type);
    const message: AuditMessage = {
      ...base,
      type,
      pkgId,
      ...(data ? { data } : {}),
    };
    await this.broker.send(cityRoutingKey(CENTRAL_ID), message);
  }
}
