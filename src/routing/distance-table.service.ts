import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
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
import { RoutingOrchestratorService } from '@/routing/routing-orchestrator.service';

export interface ComputedRoute {
  nextHop: string | null;
  totalDistance: number;
  totalCost: number;
  path: string[];
}

export interface RoutingTables {
  byDistance: Record<string, ComputedRoute>;
  byPrice: Record<string, ComputedRoute>;
}

@Injectable()
export class DistanceTableService implements OnModuleInit {
  private distances = new Map<string, DistanceTableEntry>();

  private computedRoutes: RoutingTables | null = null;

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    @Inject(forwardRef(() => RoutingOrchestratorService))
    private readonly routingOrchestrator: RoutingOrchestratorService,
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

  updateFromMessage(message: unknown): void {
    const parsed = DistanceTableMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw new Error('Distance table message missing distances payload.');
    }
    this.updateDistances(parsed.data.data.distances);
  }

  updateDistances(distances: Record<string, DistanceTableEntry>): void {
    this.distances = new Map(Object.entries(distances));

    // Cada vez que el broker nos mande distancias frescas, agendamos el cálculo
    // con debounce (agrupa ráfagas de cost-update en un solo recálculo).
    this.routingOrchestrator.scheduleRouteRecomputation();
  }

  updateComputedRoutes(routes: RoutingTables): void {
    this.computedRoutes = routes;
    console.log('Nuevas tablas de enrutamiento aplicadas exitosamente.');
  }

  getNextHop(
    destinationId: string,
    criteria: 'price' | 'distance',
  ): string | null {
    if (!this.computedRoutes) {
      console.warn(
        `getNextHop: Las tablas de enrutamiento aún no han sido calculadas.`,
      );
      return null;
    }

    const tableToLook =
      criteria === 'price'
        ? this.computedRoutes.byPrice
        : this.computedRoutes.byDistance;

    const route = tableToLook[destinationId];

    return route?.nextHop ?? null;
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
