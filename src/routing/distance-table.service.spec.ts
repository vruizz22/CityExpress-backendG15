import { DistanceTableService } from '@/routing/distance-table.service';
import {
  DistanceTableEntry,
  DistanceTableMessage,
  DistanceTableRequestMessage,
} from '@/messaging/message.types';
import { MessageBrokerService } from '@/messaging/message-broker.interface';

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

  it('requests the initial distance table from central', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker);

    await service.requestInitialTable();

    const [routingKey, payload] = (broker.send as jest.Mock).mock.calls[0] as [
      string,
      DistanceTableRequestMessage,
    ];
    expect(routingKey).toBe('city.central');
    expect(payload.type).toBe('request');
    expect(payload.data.ask).toBe('distance-table');
  });

  it('updates and queries direct routes', () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker);
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
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker);
    service.updateDistances(buildDistances());

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const pick = service.pickRandomEnabledDestination(new Set(['TK3']));
    randomSpy.mockRestore();

    expect(pick).toBe('HGW');
  });

  it('throws when distance-table payload is missing', () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn(),
    };
    const service = new DistanceTableService(broker);
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
});
