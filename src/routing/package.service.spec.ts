import { Test, TestingModule } from '@nestjs/testing';
import { PackageService } from '@/routing/package.service';
import { MESSAGE_BROKER } from '@/messaging/message-broker.interface';
import { AuditService } from '@/routing/audit.service';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PendingPackagesRepository } from '@/routing/pending-packages.repository';
import { PackageDeliveryService } from '@/routing/package-delivery.service';
import { PackageTransitMessage } from '@/messaging/message.types';

describe('PackageService', () => {
  let service: PackageService;
  let broker: { send: jest.Mock };
  let audit: {
    reportReceived: jest.Mock;
    reportDelivered: jest.Mock;
    reportExpired: jest.Mock;
    reportTransit: jest.Mock;
    reportTransitRedirect: jest.Mock;
  };
  // --- ACTUALIZADO: Cambiamos las funciones antiguas por el nuevo método ---
  let distanceTable: {
    getNextHop: jest.Mock;
  };
  let packageEvents: { recordInbound: jest.Mock };
  let pending: {
    savePendingDelivery: jest.Mock;
    savePendingRoute: jest.Mock;
    findPendingDeliveriesReady: jest.Mock;
    findPendingRoutes: jest.Mock;
    removePending: jest.Mock;
  };
  let delivery: { deliver: jest.Mock };

  const baseMessage = (
    overrides?: Partial<PackageTransitMessage>,
  ): PackageTransitMessage => ({
    idpk: 'idpk-1',
    msgId: 'msg-1',
    type: 'package-transit',
    timestamp: '2026-04-29T00:00:00.000Z',
    cityId: 'RNC',
    packageBody: {
      id: 'pkg-1',
      deliveryStrategy: 'direct',
      maxHops: 2,
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
    ...overrides,
  });

  beforeEach(async () => {
    broker = { send: jest.fn() };
    audit = {
      reportReceived: jest.fn(),
      reportDelivered: jest.fn(),
      reportExpired: jest.fn(),
      reportTransit: jest.fn(),
      reportTransitRedirect: jest.fn(),
    };
    // --- ACTUALIZADO: Inicializamos el mock con getNextHop ---
    distanceTable = {
      getNextHop: jest.fn(),
    };
    packageEvents = {
      recordInbound: jest.fn().mockResolvedValue('created'),
    };
    pending = {
      savePendingDelivery: jest.fn(),
      savePendingRoute: jest.fn(),
      findPendingDeliveriesReady: jest.fn(),
      findPendingRoutes: jest.fn(),
      removePending: jest.fn(),
    };
    delivery = { deliver: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackageService,
        { provide: MESSAGE_BROKER, useValue: broker },
        { provide: AuditService, useValue: audit },
        { provide: DistanceTableService, useValue: distanceTable },
        { provide: PackageEventsRepository, useValue: packageEvents },
        { provide: PendingPackagesRepository, useValue: pending },
        { provide: PackageDeliveryService, useValue: delivery },
      ],
    }).compile();

    service = module.get<PackageService>(PackageService);
  });

  it('delivers immediately when destination is ours and deliverNotBefore passed', async () => {
    const now = new Date('2026-04-29T11:00:00.000Z');
    const message = baseMessage({
      packageBody: {
        ...baseMessage().packageBody,
        destinationId: 'TK3',
        deliverNotBefore: '2026-04-29T10:00:00.000Z',
      },
    });

    await service.handlePackageTransit(message, now);

    expect(audit.reportReceived).toHaveBeenCalledWith('pkg-1');
    expect(delivery.deliver).toHaveBeenCalled();
    expect(audit.reportDelivered).toHaveBeenCalledWith('pkg-1');
    expect(pending.savePendingDelivery).not.toHaveBeenCalled();
  });

  it('acks and skips processing when idpk is duplicated', async () => {
    packageEvents.recordInbound.mockResolvedValue('duplicate');
    const message = baseMessage();

    await service.handlePackageTransit(message, new Date());

    const calls = broker.send.mock.calls as [string, { type?: string }][];
    const ackCall = calls.find(
      ([routingKey, payload]) =>
        routingKey === 'city.rnc' && payload?.type === 'ack',
    );
    expect(ackCall).toBeDefined();
    expect(audit.reportTransit).not.toHaveBeenCalled();
    expect(audit.reportTransitRedirect).not.toHaveBeenCalled();
  });

  it('stores pending delivery when deliverNotBefore is in the future', async () => {
    const now = new Date('2026-04-29T09:00:00.000Z');
    const message = baseMessage({
      packageBody: {
        ...baseMessage().packageBody,
        destinationId: 'TK3',
        deliverNotBefore: '2026-04-29T10:00:00.000Z',
      },
    });

    await service.handlePackageTransit(message, now);

    expect(audit.reportReceived).toHaveBeenCalledWith('pkg-1');
    expect(pending.savePendingDelivery).toHaveBeenCalledWith(message);
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(audit.reportDelivered).not.toHaveBeenCalled();
  });

  it('expires packages when maxHops is 0', async () => {
    const message = baseMessage({
      packageBody: {
        ...baseMessage().packageBody,
        destinationId: 'HGW',
        maxHops: 0,
      },
    });

    await service.handlePackageTransit(message, new Date());

    expect(audit.reportExpired).toHaveBeenCalledWith('pkg-1');
    expect(pending.savePendingRoute).not.toHaveBeenCalled();
  });

  it('routes directly when a direct route exists', async () => {
    // --- ACTUALIZADO: getNextHop devuelve la misma ciudad destino (Ruta directa) ---
    distanceTable.getNextHop.mockReturnValue('HGW');
    const message = baseMessage({
      packageBody: {
        ...baseMessage().packageBody,
        destinationId: 'HGW',
        maxHops: 2,
      },
    });

    await service.handlePackageTransit(message, new Date());

    const directCall = broker.send.mock.calls.find(
      ([routingKey, payload]) =>
        routingKey === 'city.hgw' &&
        (payload as PackageTransitMessage).type === 'package-transit',
    ) as [string, PackageTransitMessage] | undefined;

    expect(directCall).toBeDefined();
    if (directCall) {
      const [, payload] = directCall;
      expect(payload.packageBody.maxHops).toBe(1);
    }
    expect(audit.reportTransit).toHaveBeenCalledWith('pkg-1', 'HGW');
  });

  it('redirects when no direct route and a candidate exists', async () => {
    // --- ACTUALIZADO: getNextHop devuelve una ciudad intermedia 'MET' (Redirección) ---
    distanceTable.getNextHop.mockReturnValue('MET');
    const message = baseMessage({
      cityId: 'RNC',
      packageBody: {
        ...baseMessage().packageBody,
        destinationId: 'HGW',
        maxHops: 3,
      },
    });

    await service.handlePackageTransit(message, new Date());

    // Se removió el chequeo de parámetros del método aleatorio antiguo ya que no se usa

    const redirectCall = broker.send.mock.calls.find(
      ([routingKey, payload]) =>
        routingKey === 'city.met' &&
        (payload as PackageTransitMessage).type === 'package-transit',
    ) as [string, PackageTransitMessage] | undefined;

    expect(redirectCall).toBeDefined();
    if (redirectCall) {
      const [, payload] = redirectCall;
      expect(payload.packageBody.maxHops).toBe(2);
    }
    expect(audit.reportTransitRedirect).toHaveBeenCalledWith('pkg-1', 'MET');
  });

  it('persists pending route when no routes are available', async () => {
    // --- ACTUALIZADO: getNextHop devuelve null (Sin ruta calculada aún) ---
    distanceTable.getNextHop.mockReturnValue(null);
    const message = baseMessage();

    await service.handlePackageTransit(message, new Date());

    expect(pending.savePendingRoute).toHaveBeenCalledWith(message);
    expect(audit.reportTransit).not.toHaveBeenCalled();
    expect(audit.reportTransitRedirect).not.toHaveBeenCalled();
  });

  it('processes pending deliveries when ready and skips future ones', async () => {
    const readyRecord = {
      idpk: 'pending-1',
      packageId: 'pkg-ready',
      deliveryStrategy: 'direct',
      maxHops: 1,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      deliverNotBefore: new Date('2026-04-29T09:00:00.000Z'),
      originId: 'central',
      destinationId: 'TK3',
      metaContent: '',
      isMetaEncrypted: false,
      constraints: {},
      priorityClass: 'medium',
      payment: 0,
    };
    const futureRecord = {
      ...readyRecord,
      idpk: 'pending-2',
      packageId: 'pkg-future',
      deliverNotBefore: new Date('2026-04-29T12:00:00.000Z'),
    };

    pending.findPendingDeliveriesReady.mockResolvedValue([
      readyRecord,
      futureRecord,
    ]);

    await service.processPendingDeliveries(
      new Date('2026-04-29T10:00:00.000Z'),
    );

    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(audit.reportDelivered).toHaveBeenCalledWith('pkg-ready');
    expect(pending.removePending).toHaveBeenCalledWith('pending-1');
    expect(pending.removePending).not.toHaveBeenCalledWith('pending-2');
  });

  it('processes pending routes across expiration, direct, redirect, and no-route paths', async () => {
    const baseRecord = {
      idpk: 'pending-x',
      packageId: 'pkg-x',
      deliveryStrategy: 'direct',
      maxHops: 1,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      deliverNotBefore: null,
      originId: 'central',
      destinationId: 'HGW',
      metaContent: '',
      isMetaEncrypted: false,
      constraints: {},
      priorityClass: 'medium',
      payment: 0,
    };

    const expiredRecord = { ...baseRecord, idpk: 'pending-exp', maxHops: 0 };
    const directRecord = {
      ...baseRecord,
      idpk: 'pending-direct',
      packageId: 'pkg-direct',
      destinationId: 'HGW',
    };
    const redirectRecord = {
      ...baseRecord,
      idpk: 'pending-redirect',
      packageId: 'pkg-redirect',
      destinationId: 'MET',
    };
    const noRouteRecord = {
      ...baseRecord,
      idpk: 'pending-noroute',
      packageId: 'pkg-noroute',
      destinationId: 'KLD',
    };

    pending.findPendingRoutes.mockResolvedValue([
      expiredRecord,
      directRecord,
      redirectRecord,
      noRouteRecord,
    ]);

    distanceTable.getNextHop
      .mockReturnValueOnce('HGW')
      .mockReturnValueOnce('RAP')
      .mockReturnValueOnce(null);

    await service.processPendingRoutes();

    expect(audit.reportExpired).toHaveBeenCalledWith('pkg-x');
    expect(audit.reportTransit).toHaveBeenCalledWith('pkg-direct', 'HGW');
    expect(audit.reportTransitRedirect).toHaveBeenCalledWith(
      'pkg-redirect',
      'RAP',
    );
    expect(pending.removePending).toHaveBeenCalledWith('pending-exp');
    expect(pending.removePending).toHaveBeenCalledWith('pending-direct');
    expect(pending.removePending).toHaveBeenCalledWith('pending-redirect');
    expect(pending.removePending).not.toHaveBeenCalledWith('pending-noroute');
  });

  it('drains the backlog in bounded keyset batches without loading it whole', async () => {
    process.env.PENDING_ROUTE_BATCH_SIZE = '2';
    process.env.PENDING_ROUTE_MAX_PER_RUN = '100';
    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PackageService,
          { provide: MESSAGE_BROKER, useValue: broker },
          { provide: AuditService, useValue: audit },
          { provide: DistanceTableService, useValue: distanceTable },
          { provide: PackageEventsRepository, useValue: packageEvents },
          { provide: PendingPackagesRepository, useValue: pending },
          { provide: PackageDeliveryService, useValue: delivery },
        ],
      }).compile();
      const batchedService = module.get<PackageService>(PackageService);

      const rec = (idpk: string) => ({
        idpk,
        packageId: `pkg-${idpk}`,
        deliveryStrategy: 'direct',
        maxHops: 1,
        createdAt: new Date('2026-04-29T00:00:00.000Z'),
        deliverNotBefore: null,
        originId: 'central',
        destinationId: 'HGW',
        metaContent: '',
        isMetaEncrypted: false,
        constraints: {},
        priorityClass: 'medium',
        payment: 0,
      });

      pending.findPendingRoutes
        .mockResolvedValueOnce([rec('a'), rec('b')]) // página llena (=batchSize) → sigue
        .mockResolvedValueOnce([rec('c')]); // página corta → termina
      distanceTable.getNextHop.mockReturnValue('HGW');

      await batchedService.processPendingRoutes();

      // Nunca pide "todo": pide lotes de 2 y pagina con el último idpk como cursor.
      expect(pending.findPendingRoutes).toHaveBeenNthCalledWith(
        1,
        2,
        undefined,
      );
      expect(pending.findPendingRoutes).toHaveBeenNthCalledWith(2, 2, 'b');
      expect(pending.findPendingRoutes).toHaveBeenCalledTimes(2);
      expect(pending.removePending).toHaveBeenCalledTimes(3);
    } finally {
      delete process.env.PENDING_ROUTE_BATCH_SIZE;
      delete process.env.PENDING_ROUTE_MAX_PER_RUN;
    }
  });
});
