import { BaseMessage } from './message.types';

export const MESSAGE_BROKER = Symbol('MESSAGE_BROKER');

export interface MessageBrokerService {
  send<T extends BaseMessage>(routingKey: string, message: T): Promise<void>;
  subscribe<T extends BaseMessage>(
    routingKey: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void>;
}
