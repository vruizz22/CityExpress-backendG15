import { BaseMessage } from './message.types';

export const MESSAGE_BROKER = Symbol('MESSAGE_BROKER');

// RF03 — opciones de publicación (prioridad AMQP para priority queues).
export interface SendOptions {
  priority?: number;
}

export interface MessageBrokerService {
  send<T extends BaseMessage>(
    routingKey: string,
    message: T,
    options?: SendOptions,
  ): Promise<void>;
  subscribe<T extends BaseMessage>(
    routingKey: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void>;
}
