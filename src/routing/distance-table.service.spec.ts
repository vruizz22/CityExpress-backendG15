import { DistanceTableService } from '@/routing/distance-table.service';
import {
  DistanceTableEntry,
  DistanceTableMessage,
  DistanceTableRequestMessage,
} from '@/messaging/message.types';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { RoutingOrchestratorService } from '@/routing/routing-orchestrator.service';
import { ReceivedTableRepository } from '@/routing-calc/received-table.repository';
import { RouteRepository } from '@/routing/route.repository';
import { CENTRAL_ID, CITY_CODES, CITY_ID } from '@/config/city.config';

const buildDistances = (): Record<string, DistanceTableEntry> => ({
  HGW: {
    destinationCode: 'HGW',
    destinationName: 'Hogwarts',
    distance: 100,
    transportCost: 10,
    enabled: true,
  },
  TK3: {
    destinationCode: 'TK3',
    destinationName: 'Tokyo-3',
    distance: 200,
    transportCost: 20,
    enabled: false,
  },
});

function makeService() {
  const broker: MessageBrokerService = {
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
  };
  const orchestrator = {
    triggerRouteRecomputation: jest.fn(),
    scheduleRouteRecomputation: jest.fn(),
  } as unknown as RoutingOrchestratorService;
  const receivedTables = {
    upsertTable: jest.fn().mockResolvedValue(undefined),
    getAllTables: jest.fn().mockResolvedValue({}),
  } as unknown as ReceivedTableRepository;
  const routeRepository = {
    saveSnapshot: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue([]),
  } as unknown as RouteRepository;
  const service = new DistanceTableService(
    broker,
    orchestrator,
    receivedTables,
    routeRepository,
  );
  return { service, broker, orchestrator, receivedTables, routeRepository };
}

describe('DistanceTableService', () => {
  it('requests the initial distance table from central with source', async () => {
    const { service, broker } = makeService();

    await service.requestInitialTable();

    const [routingKey, payload] = (broker.send as jest.Mock).mock.calls[0] as [
      string,
      DistanceTableRequestMessage,
    ];
    expect(routingKey).toBe('city.central');
    expect(payload.type).toBe('request');
    expect(payload.source).toBe(CITY_ID.toLowerCase());
    expect(payload.cityId).toBe(CITY_ID.toLowerCase());
    expect(payload.data.ask).toBe('distance-table');
  });

  it('throttles repeated initial-table requests (anti-spam en reconexión)', async () => {
    const { service, broker } = makeService();

    await service.requestInitialTable();
    await service.requestInitialTable(); // dentro de la ventana → omitido

    expect((broker.send as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('updates and queries direct routes', () => {
    const { service } = makeService();
    const message: DistanceTableMessage = {
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances: buildDistances() },
    };

    service.updateFromMessage(message);

    expect(service.isDirectRouteAvailable('HGW')).toBe(true);
    expect(service.isDirectRouteAvailable('TK3')).toBe(false);
  });

  it('selects a random enabled destination excluding blocked cities', () => {
    const { service } = makeService();
    service.updateDistances(buildDistances());

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const pick = service.pickRandomEnabledDestination(new Set(['TK3']));
    randomSpy.mockRestore();

    expect(pick).toBe('HGW');
  });

  it('throws when distance-table payload is missing', () => {
    const { service } = makeService();
    const message = {
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: {},
    } as DistanceTableMessage;

    expect(() => service.updateFromMessage(message)).toThrow(
      'Distance table message missing distances payload.',
    );
  });

  // --- RF06 ---

  it('fans out distance-table requests to every other city (excludes self/central)', async () => {
    const { service, broker } = makeService();

    await service.requestTablesFromAllCities();

    const calls = (broker.send as jest.Mock).mock.calls as Array<
      [string, DistanceTableRequestMessage]
    >;
    const expected = CITY_CODES.filter(
      (c) => c !== CITY_ID && c !== CENTRAL_ID,
    ).length;
    expect(calls).toHaveLength(expected);
    for (const [routingKey, payload] of calls) {
      expect(routingKey).not.toBe(`city.${CITY_ID.toLowerCase()}`);
      expect(payload.type).toBe('request');
      expect(payload.source).toBe(CITY_ID.toLowerCase());
    }
  });

  it('throttles repeated fanouts', async () => {
    const { service, broker } = makeService();

    await service.requestTablesFromAllCities();
    const first = (broker.send as jest.Mock).mock.calls.length;
    await service.requestTablesFromAllCities();
    const second = (broker.send as jest.Mock).mock.calls.length;

    expect(second).toBe(first); // segundo fanout omitido por throttle
  });

  it('responds to a peer request with ACK followed by its own cost-update', async () => {
    const { service, broker } = makeService();
    service.updateDistances(buildDistances());

    await service.respondWithOwnTable('COR');

    const calls = (broker.send as jest.Mock).mock.calls as Array<
      [string, { type: string; cityId?: string }]
    >;
    expect(calls[0][0]).toBe('city.cor');
    expect(calls[0][1].type).toBe('ack');
    expect(calls[1][0]).toBe('city.cor');
    expect(calls[1][1].type).toBe('cost-update');
    expect(calls[1][1].cityId).toBe(CITY_ID.toLowerCase());
  });

  it('stores a peer table without fanning out', async () => {
    const { service, broker, receivedTables, orchestrator } = makeService();

    await service.applyPeerTable('COR', buildDistances());

    expect(receivedTables.upsertTable).toHaveBeenCalledWith(
      'COR',
      buildDistances(),
    );
    expect(orchestrator.scheduleRouteRecomputation).toHaveBeenCalled();
    expect(broker.send).not.toHaveBeenCalled(); // sin fanout
  });

  it('applying own table triggers fanout', async () => {
    const { service, broker } = makeService();

    service.applyOwnTable(buildDistances());
    await Promise.resolve();

    expect((broker.send as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});
