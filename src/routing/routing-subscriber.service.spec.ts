import { RoutingSubscriberService } from '@/routing/routing-subscriber.service';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { DistanceTableService } from '@/routing/distance-table.service';
import { InsuranceService } from '@/routing/insurance.service';
import { PackageService } from '@/routing/package.service';

type Handler = (message: unknown) => Promise<void>;

function makeSubscriber() {
  const broker: MessageBrokerService = {
    send: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(undefined),
  };
  const distanceTable = {
    applyOwnTable: jest.fn(),
    applyPeerTable: jest.fn().mockResolvedValue(undefined),
    respondWithOwnTable: jest.fn().mockResolvedValue(undefined),
    sendAck: jest.fn().mockResolvedValue(undefined),
  } as unknown as DistanceTableService;
  const packageService = {
    processPendingRoutes: jest.fn().mockResolvedValue(undefined),
    handlePackageTransit: jest.fn().mockResolvedValue(undefined),
  } as unknown as PackageService;
  const insurance = {
    chargeInsurance: jest.fn().mockResolvedValue(undefined),
  } as unknown as InsuranceService;
  const service = new RoutingSubscriberService(
    broker,
    packageService,
    distanceTable,
    insurance,
  );
  return { broker, distanceTable, packageService, insurance, service };
}

function getHandler(broker: MessageBrokerService): Handler {
  const [, handler] = (broker.subscribe as jest.Mock).mock.calls[0] as [
    string,
    Handler,
  ];
  return handler;
}

const distances = {
  HGW: {
    destinationCode: 'HGW',
    destinationName: 'Hogwarts',
    distance: 1,
    transportCost: 1,
    enabled: true,
  },
};

describe('RoutingSubscriberService', () => {
  it('applies own table (no cityId) and processes pending routes', async () => {
    const { broker, distanceTable, packageService, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      idpk: 'idpk-1',
      msgId: 'msg-own',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances },
    });

    expect(distanceTable.applyOwnTable).toHaveBeenCalledTimes(1);
    expect(packageService.processPendingRoutes).toHaveBeenCalledTimes(1);
  });

  it('applies the central table even without idpk/msgId (real broker shape)', async () => {
    // La central responde la tabla SIN idpk/msgId (docs/requirements.md §6.2).
    // Antes el envelope se rechazaba y la tabla nunca se aplicaba: GET /routes
    // devolvía todas las ciudades como enabled:false.
    const { broker, distanceTable, packageService, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances },
    });

    expect(distanceTable.applyOwnTable).toHaveBeenCalledWith(distances);
    expect(packageService.processPendingRoutes).toHaveBeenCalledTimes(1);
  });

  it('trata la tabla con cityId en otra caja (p. ej. "tk3") como propia', async () => {
    // CITY_ID por defecto es "TK3"; si la central/echo nos manda cityId "tk3"
    // debe aplicarse a las distancias propias, no guardarse como peer.
    const { broker, distanceTable, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      type: 'cost-update',
      cityId: 'tk3',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances },
    });

    expect(distanceTable.applyOwnTable).toHaveBeenCalledWith(distances);
    expect(distanceTable.applyPeerTable).not.toHaveBeenCalled();
  });

  it('stores a peer table and sends ACK back', async () => {
    const { broker, distanceTable, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      idpk: 'idpk-2',
      msgId: 'msg-peer',
      type: 'cost-update',
      cityId: 'COR',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances },
    });

    expect(distanceTable.applyPeerTable).toHaveBeenCalledWith('COR', distances);
    expect(distanceTable.sendAck).toHaveBeenCalledWith(
      'COR',
      'idpk-2',
      'msg-peer',
      'ack',
    );
    expect(distanceTable.applyOwnTable).not.toHaveBeenCalled();
  });

  it('responds to a distance-table request from another city', async () => {
    const { broker, distanceTable, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      idpk: 'idpk-3',
      msgId: 'msg-req',
      type: 'request',
      source: 'REE',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { ask: 'distance-table' },
    });

    expect(distanceTable.respondWithOwnTable).toHaveBeenCalledWith('REE');
  });

  it('routes package-transit messages to the package service', async () => {
    const { broker, packageService, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await handler({
      idpk: 'idpk-4',
      msgId: 'msg-pkg',
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

  it('drops duplicate messages by msgId (anti-loop)', async () => {
    const { broker, distanceTable, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    const msg = {
      idpk: 'idpk-5',
      msgId: 'msg-dup',
      type: 'distance-table',
      timestamp: '2026-04-29T00:00:00.000Z',
      data: { distances },
    };
    await handler(msg);
    await handler(msg);

    expect(distanceTable.applyOwnTable).toHaveBeenCalledTimes(1);
  });

  // RF02 (E3) — package-status: somos la ciudad ORIGEN de un asegurado no entregable.
  describe('package-status', () => {
    const statusMessage = {
      idpk: 'idpk-st-1',
      msgId: 'msg-st-1',
      type: 'package-status',
      cityId: 'hgw',
      timestamp: '2026-07-02T00:00:00.000Z',
      data: { pkgId: 'pkg-1', status: 'expired', reason: 'max hops exceeded' },
    };

    it('acks the sender and triggers the idempotent insurance charge', async () => {
      const { broker, insurance, service } = makeSubscriber();
      await service.onModuleInit();
      const handler = getHandler(broker);

      await handler(statusMessage);

      const ackCall = (broker.send as jest.Mock).mock.calls.find(
        ([routingKey, payload]: [string, { type?: string }]) =>
          routingKey === 'city.hgw' && payload?.type === 'ack',
      ) as [string, { idpk: string; msgId: string }] | undefined;
      expect(ackCall).toBeDefined();
      expect(ackCall?.[1].idpk).toBe('idpk-st-1');
      expect(ackCall?.[1].msgId).toBe('msg-st-1');
      expect(insurance.chargeInsurance).toHaveBeenCalledWith(
        'pkg-1',
        'max hops exceeded',
      );
    });

    it('nacks a malformed package-status without charging', async () => {
      const { broker, insurance, service } = makeSubscriber();
      await service.onModuleInit();
      const handler = getHandler(broker);

      await handler({
        idpk: 'idpk-st-2',
        msgId: 'msg-st-2',
        type: 'package-status',
        cityId: 'hgw',
        timestamp: '2026-07-02T00:00:00.000Z',
        data: { status: 'expired' }, // sin pkgId
      });

      const nackCall = (broker.send as jest.Mock).mock.calls.find(
        ([routingKey, payload]: [string, { type?: string }]) =>
          routingKey === 'city.hgw' && payload?.type === 'nack',
      ) as [string, { type: string }] | undefined;
      expect(nackCall).toBeDefined();
      expect(insurance.chargeInsurance).not.toHaveBeenCalled();
    });

    it('acks but does not charge for a non-expired status', async () => {
      const { broker, insurance, service } = makeSubscriber();
      await service.onModuleInit();
      const handler = getHandler(broker);

      await handler({
        ...statusMessage,
        msgId: 'msg-st-3',
        data: { pkgId: 'pkg-1', status: 'delivered', reason: 'ok' },
      });

      expect(insurance.chargeInsurance).not.toHaveBeenCalled();
    });

    it('drops duplicate package-status by msgId before re-charging', async () => {
      const { broker, insurance, service } = makeSubscriber();
      await service.onModuleInit();
      const handler = getHandler(broker);

      await handler(statusMessage);
      await handler(statusMessage);

      expect(insurance.chargeInsurance).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores ack messages without throwing', async () => {
    const { broker, distanceTable, packageService, service } = makeSubscriber();
    await service.onModuleInit();
    const handler = getHandler(broker);

    await expect(
      handler({
        idpk: 'idpk-6',
        msgId: 'msg-ack',
        type: 'ack',
        cityId: 'COR',
        timestamp: '2026-04-29T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined();

    expect(distanceTable.applyOwnTable).not.toHaveBeenCalled();
    expect(packageService.handlePackageTransit).not.toHaveBeenCalled();
  });
});
