/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { BaseMessage } from './message.types';
import { MessageBrokerService } from './message-broker.interface';

const FIBONACCI_DELAYS_S = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

interface PendingMessage {
  routingKey: string;
  content: Buffer;
}

@Injectable()
export class AmqpMessageBrokerService
  implements MessageBrokerService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpMessageBrokerService.name);
  private connection: any = null;
  private channel: amqp.Channel | null = null;
  private retryIndex = 0;
  private shutdownRequested = false;
  private readonly url = process.env.RABBITMQ_URL!;
  private readonly queue = process.env.RABBITMQ_QUEUE!;
  private readonly exchange = process.env.RABBITMQ_EXCHANGE ?? 'fulfillment.x';
  private readonly subscribedHandlers: Array<(msg: unknown) => Promise<void>> =
    [];
  private readonly onConnectCallbacks: Array<() => void> = [];
  private readonly pendingMessages: PendingMessage[] = [];

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.shutdownRequested = true;
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignore on shutdown
    }
  }

  private async connect(): Promise<void> {
    if (this.shutdownRequested) return;
    try {
      // Infer TLS usage from URL scheme; only set servername for TLS connections
      let connectOpts: amqp.Options.Connect | undefined = undefined;
      try {
        const u = new URL(this.url);
        if (u.protocol === 'amqps:') {
          connectOpts = { servername: u.hostname } as amqp.Options.Connect;
        }
      } catch {
        // ignore invalid URL parsing and fall back to provided URL
      }

      const conn = (await amqp.connect(this.url, connectOpts)) as any;
      this.connection = conn;
      this.channel = await conn.createChannel();
      if (this.channel) await this.channel.prefetch(10);
      this.retryIndex = 0;
      this.logger.log(
        `Connected. Queue=${this.queue} Exchange=${this.exchange}`,
      );

      conn.on('error', (err: Error) => {
        this.logger.error(`Broker connection error: ${err.message}`);
        this.connection = null;
        this.channel = null;
        this.scheduleReconnect();
      });

      conn.on('close', () => {
        if (!this.shutdownRequested) {
          this.logger.warn(
            'Broker connection closed unexpectedly, reconnecting...',
          );
          this.connection = null;
          this.channel = null;
          this.scheduleReconnect();
        }
      });

      this.flushPendingMessages();

      for (const handler of this.subscribedHandlers) {
        await this.startConsuming(handler);
      }
      for (const cb of this.onConnectCallbacks) {
        cb();
      }
    } catch (err) {
      this.logger.error(
        `Failed to connect to broker: ${(err as Error).message}`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return;
    const delaySec =
      FIBONACCI_DELAYS_S[
        Math.min(this.retryIndex, FIBONACCI_DELAYS_S.length - 1)
      ] ?? 89;
    this.retryIndex++;
    this.logger.warn(
      `Reconnecting in ${delaySec}s (attempt ${this.retryIndex})...`,
    );
    setTimeout(() => void this.connect(), delaySec * 1000);
  }

  private flushPendingMessages(): void {
    if (!this.channel || this.pendingMessages.length === 0) return;
    this.logger.log(
      `Flushing ${this.pendingMessages.length} pending message(s)...`,
    );
    while (this.pendingMessages.length > 0) {
      const pending = this.pendingMessages.shift();
      if (!pending || !this.channel) break;
      this.channel.publish(this.exchange, pending.routingKey, pending.content, {
        persistent: true,
      });
    }
  }

  private async startConsuming(
    handler: (msg: unknown) => Promise<void>,
  ): Promise<void> {
    const ch = this.channel;
    if (!ch) return;
    await ch.consume(this.queue, (msg) => {
      if (!msg) return;

      let payload: unknown;
      try {
        payload = JSON.parse(msg.content.toString()) as unknown;
      } catch {
        this.logger.error(
          'Malformed message — cannot parse JSON, nacking without requeue',
        );
        ch.nack(msg, false, false);
        return;
      }

      handler(payload)
        .then(() => ch.ack(msg))
        .catch((err: Error) => {
          this.logger.error(
            `Message handler error: ${err.message} — nacking with requeue`,
          );
          ch.nack(msg, false, true);
        });
    });
  }

  send<T extends BaseMessage>(routingKey: string, message: T): Promise<void> {
    const content = Buffer.from(JSON.stringify(message));
    if (!this.channel) {
      this.logger.warn(
        `No channel — queuing message for later (routingKey=${routingKey}, type=${message.type})`,
      );
      this.pendingMessages.push({ routingKey, content });
      return Promise.resolve();
    }
    this.channel.publish(this.exchange, routingKey, content, {
      persistent: true,
    });
    return Promise.resolve();
  }

  onConnect(cb: () => void): void {
    this.onConnectCallbacks.push(cb);
  }

  async subscribe<T extends BaseMessage>(
    _routingKey: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void> {
    const wrapped = (msg: unknown) => handler(msg as T);
    this.subscribedHandlers.push(wrapped);
    if (this.channel) {
      await this.startConsuming(wrapped);
    }
  }
}
