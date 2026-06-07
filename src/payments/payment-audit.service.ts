import { Inject, Injectable } from '@nestjs/common';
import { CENTRAL_ID, cityRoutingKey } from '@config/city.config';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { createBaseMessage } from '@/messaging/message.factory';
import {
  PaymentStatusData,
  PaymentStatusMessage,
} from '@/messaging/message.types';

@Injectable()
export class PaymentAuditService {
  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
  ) {}

  async report(
    pkgId: string,
    paymentToken: string,
    data: PaymentStatusData,
  ): Promise<void> {
    const base = createBaseMessage('payment-status');
    const message: PaymentStatusMessage = {
      ...base,
      type: 'payment-status',
      pkgId,
      payment_token: paymentToken,
      data,
    };
    await this.broker.send(cityRoutingKey(CENTRAL_ID), message);
  }
}
