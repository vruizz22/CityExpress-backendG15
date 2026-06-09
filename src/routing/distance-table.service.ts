import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  CENTRAL_ID,
  CITY_CODES,
  CITY_ID,
  cityRoutingKey,
  sameCity,
} from '@/config/city.config';
import {
  AckMessage,
  DistanceTableEntry,
  DistanceTableMessage,
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
import { ReceivedTableRepository } from '@/routing-calc/received-table.repository';
import { RouteRepository } from '@/routing/route.repository';

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
  private readonly logger = new Logger(DistanceTableService.name);

  private distances = new Map<string, DistanceTableEntry>();

  private computedRoutes: RoutingTables | null = null;

  // Anti-loop / anti-spam: no re-disparar fanout más de una vez por ventana.
  private readonly fanoutThrottleMs = Number(
    process.env.TABLE_FANOUT_THROTTLE_MS ?? 5000,
  );
  private lastFanoutAt = 0;

  // Evita inundar la central con el request inicial cuando la conexión flapea
  // (cada reconexión dispara onConnect). Permite reintentos espaciados para
  // recuperarse si la primera respuesta nunca llega.
  private readonly initialRequestThrottleMs = Number(
    process.env.TABLE_REQUEST_THROTTLE_MS ?? 15000,
  );
  private lastInitialRequestAt = 0;

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: MessageBrokerService,
    @Inject(forwardRef(() => RoutingOrchestratorService))
    private readonly routingOrchestrator: RoutingOrchestratorService,
    private readonly receivedTables: ReceivedTableRepository,
    private readonly routeRepository: RouteRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.broker instanceof AmqpMessageBrokerService) {
      this.broker.onConnect(() => void this.requestInitialTable());
    }
    await this.requestInitialTable();
  }

  /** Pide a la central nuestra tabla de distancias. RF06. */
  async requestInitialTable(): Promise<void> {
    const now = Date.now();
    if (now - this.lastInitialRequestAt < this.initialRequestThrottleMs) {
      this.logger.debug('Request inicial de tabla omitido por throttle.');
      return;
    }
    this.lastInitialRequestAt = now;

    const base = createBaseMessage('request');
    const message: DistanceTableRequestMessage = {
      ...base,
      type: 'request',
      // `source` en minúscula: la central responde a `city.<source>` y nuestra
      // cola está bindeada en minúscula (`city.tk3`). Con mayúscula la respuesta
      // se rutearía a `city.TK3` y se perdería.
      source: CITY_ID.toLowerCase(),
      data: { ask: 'distance-table' },
    };
    this.logger.log(
      `Solicitando tabla inicial a la central (routingKey=${cityRoutingKey(
        CENTRAL_ID,
      )}, source=${message.source}).`,
    );
    await this.broker.send(cityRoutingKey(CENTRAL_ID), message);
  }

  /**
   * RF06: al recibir nuestra tabla desde la central, pedimos su tabla a todas
   * las demás ciudades (excluye la propia y la central). Throttle para no
   * inundar el broker ante ráfagas de cost-update.
   */
  async requestTablesFromAllCities(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFanoutAt < this.fanoutThrottleMs) {
      this.logger.debug('Fanout de tablas omitido por throttle.');
      return;
    }
    this.lastFanoutAt = now;

    const targets = CITY_CODES.filter(
      (code) => code !== CITY_ID && code !== CENTRAL_ID,
    );
    this.logger.log(`Solicitando tablas a ${targets.length} ciudades (RF06).`);
    for (const code of targets) {
      const base = createBaseMessage('request');
      const message: DistanceTableRequestMessage = {
        ...base,
        type: 'request',
        source: CITY_ID.toLowerCase(),
        data: { ask: 'distance-table' },
      };
      await this.broker.send(cityRoutingKey(code), message);
    }
  }

  /**
   * RF06: respondemos un request de otra ciudad enviando ACK y luego nuestra
   * tabla vigente como cost-update a la cola de la ciudad solicitante.
   */
  async respondWithOwnTable(requesterCityId: string): Promise<void> {
    if (!requesterCityId || sameCity(requesterCityId, CITY_ID)) {
      return;
    }
    const base = createBaseMessage('cost-update');
    await this.sendAck(requesterCityId, base.idpk, base.msgId, 'ack');

    const message: DistanceTableMessage = {
      ...base,
      type: 'cost-update',
      cityId: CITY_ID.toLowerCase(),
      data: { distances: this.getSnapshot() },
    };
    await this.broker.send(cityRoutingKey(requesterCityId), message);
  }

  /** Aplica nuestra propia tabla (recibida de la central). Dispara fanout. */
  applyOwnTable(distances: Record<string, DistanceTableEntry>): void {
    this.updateDistances(distances);
    void this.requestTablesFromAllCities();
  }

  /**
   * Aplica la tabla de OTRA ciudad: la guarda en la matriz (ReceivedTable) y
   * agenda recálculo. NO hace fanout (rompe el ciclo request→respuesta→request).
   */
  async applyPeerTable(
    cityId: string,
    distances: Record<string, DistanceTableEntry>,
  ): Promise<void> {
    await this.receivedTables.upsertTable(cityId, distances);
    this.routingOrchestrator.scheduleRouteRecomputation();
  }

  /** ACK/NACK para flujos de tabla. RF06. */
  async sendAck(
    destinationCityId: string,
    idpk: string,
    msgId: string,
    type: 'ack' | 'nack',
  ): Promise<void> {
    const ack: AckMessage = {
      idpk,
      msgId,
      type,
      timestamp: new Date().toISOString(),
      cityId: CITY_ID,
    };
    await this.broker.send(cityRoutingKey(destinationCityId), ack);
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

    const total = this.distances.size;
    const enabled = Array.from(this.distances.values()).filter(
      (e) => e.enabled,
    ).length;
    this.logger.log(
      `Tabla de distancias actualizada: ${total} entradas (${enabled} habilitadas).`,
    );

    // Persistir en BD para que /routes sea consistente entre procesos y
    // sobreviva reinicios (el snapshot en memoria es por-proceso). Fire-and-
    // forget: no bloquea el flujo del broker; si falla, se reintenta al próximo
    // cost-update.
    void this.routeRepository.saveSnapshot(distances).catch((err: Error) => {
      this.logger.error(
        `No se pudo persistir la tabla de rutas en BD: ${err.message}`,
      );
    });

    // Cada vez que el broker nos mande distancias frescas, agendamos el cálculo
    // con debounce (agrupa ráfagas de cost-update en un solo recálculo).
    this.routingOrchestrator.scheduleRouteRecomputation();
  }

  updateComputedRoutes(routes: RoutingTables): void {
    this.computedRoutes = routes;
    this.logger.log('Nuevas tablas de enrutamiento aplicadas exitosamente.');
  }

  getNextHop(
    destinationId: string,
    criteria: 'price' | 'distance',
  ): string | null {
    if (!this.computedRoutes) {
      this.logger.warn(
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
