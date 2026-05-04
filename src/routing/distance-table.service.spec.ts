import { DistanceTableService } from '@/routing/distance-table.service';
import {
  DistanceTableEntry,
  DistanceTableMessage,
  DistanceTableRequestMessage,
} from '@/messaging/message.types';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { PrismaService } from '@/prisma.service';

describe('DistanceTableService', () => {
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

  const buildPrismaMock = () =>
    ({
      route: { upsert: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    }) as unknown as PrismaService;

  it('requests the initial distance table from central', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker, buildPrismaMock());

    await service.requestInitialTable();

    const [routingKey, payload] = (broker.send as jest.Mock).mock.calls[0] as [
      string,
      DistanceTableRequestMessage,
    ];
    expect(routingKey).toBe('city.central');
    expect(payload.type).toBe('request');
    expect(payload.data.ask).toBe('distance-table');
  });

  it('updates and queries direct routes', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const prisma = buildPrismaMock();
    const service = new DistanceTableService(broker, prisma);
    const message: DistanceTableMessage = {
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances: buildDistances() },
    };

    await service.updateFromMessage(message);

    expect(service.isDirectRouteAvailable('HGW')).toBe(true);
    expect(service.isDirectRouteAvailable('TK3')).toBe(false);
    expect((prisma.route.upsert as jest.Mock).mock.calls).toHaveLength(2);
    const upsertCalls = (prisma.route.upsert as jest.Mock).mock.calls as Array<
      [
        {
          where: { code: string };
          create: {
            code: string;
            name: string;
            enabled: boolean;
            distance: bigint;
            transportCost: bigint;
          };
          update: {
            name: string;
            enabled: boolean;
            distance: bigint;
            transportCost: bigint;
          };
        },
      ]
    >;
    const hgwCall = upsertCalls.find(([arg]) => arg.where.code === 'HGW');
    expect(hgwCall).toBeDefined();
    expect(hgwCall![0].create.enabled).toBe(true);
    expect(hgwCall![0].create.distance).toBe(BigInt(100));
    expect(hgwCall![0].create.transportCost).toBe(BigInt(10));
    expect(hgwCall![0].update.enabled).toBe(true);
  });

  it('selects a random enabled destination excluding blocked cities', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker, buildPrismaMock());
    await service.updateDistances(buildDistances());

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const pick = service.pickRandomEnabledDestination(new Set(['TK3']));
    randomSpy.mockRestore();

    expect(pick).toBe('HGW');
  });

  it('throws when distance-table payload is missing', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker, buildPrismaMock());
    const message = {
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: {},
    } as DistanceTableMessage;

    await expect(service.updateFromMessage(message)).rejects.toThrow(
      'Distance table message missing distances payload.',
    );
  });
});
