import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CENTRAL_ID, cityRoutingKey } from '@/config/city.config';
import {
  DistanceTableEntry,
  DistanceTableRequestMessage,
} from '@/messaging/message.types';
import {
  MESSAGE_BROKER,
  MessageBrokerService,
} from '@/messaging/message-broker.interface';
import { AmqpMessageBrokerService } from '@/messaging/amqp-message-broker.service';
import { createBaseMessage } from '@/messaging/message.factory';
import { DistanceTableMessageSchema } from '@/messaging/message.schemas';
import { PrismaService } from '@/prisma.service';

@Injectable()
export class DistanceTableService implements OnModuleInit {
  private distances = new Map<string, DistanceTableEntry>();

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.broker instanceof AmqpMessageBrokerService) {
      this.broker.onConnect(() => void this.requestInitialTable());
    }
    await this.requestInitialTable();
  }

  async requestInitialTable(): Promise<void> {
    const base = createBaseMessage('request');
    const message: DistanceTableRequestMessage = {
      ...base,
      type: 'request',
      data: { ask: 'distance-table' },
    };
    await this.broker.send(cityRoutingKey(CENTRAL_ID), message);
  }

  async updateFromMessage(message: unknown): Promise<void> {
    const parsed = DistanceTableMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw new Error('Distance table message missing distances payload.');
    }
    await this.updateDistances(parsed.data.data.distances);
  }

  async updateDistances(
    distances: Record<string, DistanceTableEntry>,
  ): Promise<void> {
    this.distances = new Map(Object.entries(distances));
    await this.persistDistances(distances);
  }

  private async persistDistances(
    distances: Record<string, DistanceTableEntry>,
  ): Promise<void> {
    const entries = Object.values(distances);
    if (entries.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.route.upsert({
          where: { code: entry.destinationCode },
          create: {
            code: entry.destinationCode,
            name: entry.destinationName,
            enabled: entry.enabled,
            distance: BigInt(Math.trunc(entry.distance)),
            transportCost: BigInt(Math.trunc(entry.transportCost)),
          },
          update: {
            name: entry.destinationName,
            enabled: entry.enabled,
            distance: BigInt(Math.trunc(entry.distance)),
            transportCost: BigInt(Math.trunc(entry.transportCost)),
          },
        }),
      ),
    );
  }

  isDirectRouteAvailable(destinationId: string): boolean {
    return this.distances.get(destinationId)?.enabled === true;
  }

  pickRandomEnabledDestination(excluded: Set<string>): string | null {
    const candidates = Array.from(this.distances.values())
      .filter((entry) => entry.enabled)
      .map((entry) => entry.destinationCode)
      .filter((code) => !excluded.has(code));

    if (candidates.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index] ?? null;
  }

  getSnapshot(): Record<string, DistanceTableEntry> {
    return Object.fromEntries(this.distances.entries());
  }
}
