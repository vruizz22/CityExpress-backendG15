import { Injectable } from '@nestjs/common';
import { BaseMessage } from './message.types';
import { MessageBrokerService } from './message-broker.interface';

@Injectable()
export class NoopMessageBrokerService implements MessageBrokerService {
  send<T extends BaseMessage>(routingKey: string, message: T): Promise<void> {
    console.warn(
      `[Broker] send skipped (routingKey=${routingKey}, type=${message.type})`,
    );
    return Promise.resolve();
  }

  subscribe<T extends BaseMessage>(
    routingKey: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void> {
    void handler;
    console.warn(`[Broker] subscribe skipped (routingKey=${routingKey})`);
    return Promise.resolve();
  }
}
