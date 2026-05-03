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
import { createBaseMessage } from '@/messaging/message.factory';
import { DistanceTableMessageSchema } from '@/messaging/message.schemas';

@Injectable()
export class DistanceTableService implements OnModuleInit {
  private distances = new Map<string, DistanceTableEntry>();

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
  ) {}

  async onModuleInit(): Promise<void> {
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

  updateFromMessage(message: unknown): void {
    const parsed = DistanceTableMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw new Error('Distance table message missing distances payload.');
    }
    this.updateDistances(parsed.data.data.distances);
  }

  updateDistances(distances: Record<string, DistanceTableEntry>): void {
    this.distances = new Map(Object.entries(distances));
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
