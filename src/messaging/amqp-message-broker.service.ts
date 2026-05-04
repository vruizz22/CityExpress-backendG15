import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import amqp from 'amqplib';
import { BaseMessage } from './message.types';
import { MessageBrokerService } from './message-broker.interface';

const FIBONACCI_DELAYS_S = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

@Injectable()
export class AmqpMessageBrokerService
  implements MessageBrokerService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpMessageBrokerService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private retryIndex = 0;
  private shutdownRequested = false;
  private readonly url = process.env.RABBITMQ_URL!;
  private readonly queue = process.env.RABBITMQ_QUEUE!;
  private readonly exchange = process.env.RABBITMQ_EXCHANGE ?? 'fulfillment.x';
  private readonly subscribedHandlers: Array<(msg: unknown) => Promise<void>> = [];

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
      const conn = await amqp.connect(this.url, {
        servername: 'broker.iic2173.org',
      });
      this.connection = conn;
      this.channel = await conn.createChannel();
      await this.channel.prefetch(10);
      this.retryIndex = 0;
      this.logger.log(`Connected. Queue=${this.queue} Exchange=${this.exchange}`);

      conn.on('error', (err: Error) => {
        this.logger.error(`Broker connection error: ${err.message}`);
        this.connection = null;
        this.channel = null;
        this.scheduleReconnect();
      });

      conn.on('close', () => {
        if (!this.shutdownRequested) {
          this.logger.warn('Broker connection closed unexpectedly, reconnecting...');
          this.connection = null;
          this.channel = null;
          this.scheduleReconnect();
        }
      });

      for (const handler of this.subscribedHandlers) {
        await this.startConsuming(handler);
      }
    } catch (err) {
      this.logger.error(`Failed to connect to broker: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return;
    const delaySec =
      FIBONACCI_DELAYS_S[Math.min(this.retryIndex, FIBONACCI_DELAYS_S.length - 1)] ?? 89;
    this.retryIndex++;
    this.logger.warn(`Reconnecting in ${delaySec}s (attempt ${this.retryIndex})...`);
    setTimeout(() => void this.connect(), delaySec * 1000);
  }

  private async startConsuming(handler: (msg: unknown) => Promise<void>): Promise<void> {
    const ch = this.channel;
    if (!ch) return;
    await ch.consume(this.queue, (msg) => {
      if (!msg) return;
      const payload = JSON.parse(msg.content.toString()) as unknown;
      handler(payload)
        .then(() => ch.ack(msg))
        .catch((err: Error) => {
          this.logger.error(`Message handler error: ${err.message}`);
          ch.ack(msg);
        });
    });
  }

  async send<T extends BaseMessage>(routingKey: string, message: T): Promise<void> {
    if (!this.channel) {
      this.logger.warn(
        `Cannot send — no channel (routingKey=${routingKey}, type=${message.type})`,
      );
      return;
    }
    const content = Buffer.from(JSON.stringify(message));
    this.channel.publish(this.exchange, routingKey, content, { persistent: true });
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
