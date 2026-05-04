import { PendingPackagesRepository } from '@/routing/pending-packages.repository';
import { PrismaService } from '@/prisma.service';
import { PackageTransitMessage } from '@/messaging/message.types';

describe('PendingPackagesRepository', () => {
  type UpsertArgs = {
    where: { idpk: string };
    create: { type: string } & Record<string, unknown>;
    update: { type: string } & Record<string, unknown>;
  };
  type FindManyArgs = {
    where: { type: string; deliverNotBefore?: { lte: Date } };
    orderBy?: { deliverNotBefore: 'asc' };
  };
  type DeleteArgs = { where: { idpk: string } };

  let prisma: {
    packageEvent: {
      upsert: jest.Mock<Promise<unknown>, [UpsertArgs]>;
      findMany: jest.Mock<Promise<unknown>, [FindManyArgs]>;
      delete: jest.Mock<Promise<unknown>, [DeleteArgs]>;
    };
  };
  let repository: PendingPackagesRepository;

  const message: PackageTransitMessage = {
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
  };

  beforeEach(() => {
    prisma = {
      packageEvent: {
        upsert: jest.fn<Promise<unknown>, [UpsertArgs]>(),
        findMany: jest.fn<Promise<unknown>, [FindManyArgs]>(),
        delete: jest.fn<Promise<unknown>, [DeleteArgs]>(),
      },
    };
    repository = new PendingPackagesRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('upserts pending delivery entries', async () => {
    await repository.savePendingDelivery(message);

    const call = prisma.packageEvent.upsert.mock.calls[0][0];

    expect(call.where.idpk).toBe('idpk-1');
    expect(call.create.type).toBe('pending-delivery');
    expect(call.update.type).toBe('pending-delivery');
    expect(call.create.senderCityId).toBe('RNC');
    expect(call.update.senderCityId).toBe('RNC');
  });

  it('upserts pending route entries', async () => {
    await repository.savePendingRoute(message);

    const call = prisma.packageEvent.upsert.mock.calls[0][0];

    expect(call.create.type).toBe('pending-route');
    expect(call.update.type).toBe('pending-route');
    expect(call.create.senderCityId).toBe('RNC');
    expect(call.update.senderCityId).toBe('RNC');
  });

  it('queries pending deliveries ready by deliverNotBefore', async () => {
    const now = new Date('2026-04-29T10:00:00.000Z');

    await repository.findPendingDeliveriesReady(now);

    const call = prisma.packageEvent.findMany.mock.calls[0][0] as {
      where: { type: string; deliverNotBefore: { lte: Date } };
      orderBy?: { deliverNotBefore: 'asc' };
    };

    expect(call.where.type).toBe('pending-delivery');
    expect(call.where.deliverNotBefore.lte).toBe(now);
    expect(call.orderBy?.deliverNotBefore).toBe('asc');
  });

  it('queries pending routes', async () => {
    await repository.findPendingRoutes();

    const call = prisma.packageEvent.findMany.mock.calls[0][0];

    expect(call.where.type).toBe('pending-route');
  });

  it('removes pending entries by idpk', async () => {
    await repository.removePending('idpk-9');

    const call = prisma.packageEvent.delete.mock.calls[0][0];

    expect(call.where.idpk).toBe('idpk-9');
  });
});
