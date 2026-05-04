import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PrismaService } from '@/prisma.service';
import { PackageTransitMessage } from '@/messaging/message.types';

describe('PackageEventsRepository', () => {
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

  it('records inbound events with sender city', async () => {
    const createMock = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
    const prisma = {
      packageEvent: {
        create: createMock,
      },
    } as unknown as PrismaService;
    const repository = new PackageEventsRepository(prisma);

    const result = await repository.recordInbound(message, 'RNC');

    expect(result).toBe('created');
    const call = createMock.mock.calls[0][0] as {
      data: { idpk: string; senderCityId: string | null };
    };
    expect(call.data.idpk).toBe('idpk-1');
    expect(call.data.senderCityId).toBe('RNC');
  });

  it('returns duplicate on unique constraint errors', async () => {
    const prisma = {
      packageEvent: {
        create: jest
          .fn<Promise<unknown>, [Record<string, unknown>]>()
          .mockRejectedValue({
            code: 'P2002',
          }),
      },
    } as unknown as PrismaService;
    const repository = new PackageEventsRepository(prisma);

    const result = await repository.recordInbound(message, 'RNC');

    expect(result).toBe('duplicate');
  });
});
