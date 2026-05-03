import { RoutingSubscriberService } from '@/routing/routing-subscriber.service';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageService } from '@/routing/package.service';

describe('RoutingSubscriberService', () => {
  it('routes distance-table updates and processes pending routes', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
    };
    const distanceTable = {
      updateFromMessage: jest.fn(),
    } as unknown as DistanceTableService;
    const packageService = {
      processPendingRoutes: jest.fn(),
      handlePackageTransit: jest.fn(),
    } as unknown as PackageService;
    const service = new RoutingSubscriberService(
      broker,
      packageService,
      distanceTable,
    );

    await service.onModuleInit();

    const [, handler] = (broker.subscribe as jest.Mock).mock.calls[0] as [
      string,
      (message: unknown) => Promise<void>,
    ];

    await handler({
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: {
        distances: {
          HGW: {
            destinationCode: 'HGW',
            destinationName: 'Hogwarts',
            distance: 1,
            transportCost: 1,
            enabled: true,
          },
        },
      },
    });

    expect(distanceTable.updateFromMessage).toHaveBeenCalledTimes(1);
    expect(packageService.processPendingRoutes).toHaveBeenCalledTimes(1);
  });

  it('routes package-transit messages to the package service', async () => {
    const broker: MessageBrokerService = {
      send: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
    };
    const distanceTable = {
      updateFromMessage: jest.fn(),
    } as unknown as DistanceTableService;
    const packageService = {
      processPendingRoutes: jest.fn(),
      handlePackageTransit: jest.fn(),
    } as unknown as PackageService;
    const service = new RoutingSubscriberService(
      broker,
      packageService,
      distanceTable,
    );

    await service.onModuleInit();

    const [, handler] = (broker.subscribe as jest.Mock).mock.calls[0] as [
      string,
      (message: unknown) => Promise<void>,
    ];

    await handler({
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'package-transit',
      timestamp: '2026-04-29T00:00:00.000Z',
      packageBody: {
        id: 'pkg-1',
        deliveryStrategy: 'direct',
        maxHops: 1,
        createdAt: '2026-04-29T00:00:00.000Z',
        deliverNotBefore: '2026-04-29T10:00:00.000Z',
        originId: 'central',
        destinationId: 'HGW',
        metaContent: '',
        isMetaEncrypted: false,
        constraints: {},
        priorityClass: 'medium',
        payment: 0,
      },
    });

    expect(packageService.handlePackageTransit).toHaveBeenCalledTimes(1);
  });
});
