import { RouteRepository } from '@/routing/route.repository';
import { PrismaService } from '@/prisma.service';
import { DistanceTableEntry } from '@/messaging/message.types';

function makePrisma() {
  return {
    route: {
      upsert: jest.fn().mockReturnValue({ __op: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockResolvedValue(undefined),
  } as unknown as PrismaService & {
    route: { upsert: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
}

const distances: Record<string, DistanceTableEntry> = {
  HGW: {
    destinationCode: 'HGW',
    destinationName: 'Hogwarts',
    distance: 46915892,
    transportCost: 997941,
    enabled: true,
  },
};

describe('RouteRepository', () => {
  it('upsertea cada entrada del snapshot en una transacción', async () => {
    const prisma = makePrisma();
    const repo = new RouteRepository(prisma);

    await repo.saveSnapshot(distances);

    expect(prisma.route.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const calls = prisma.route.upsert.mock.calls as Array<
      [
        {
          where: { code: string };
          update: { enabled: boolean; distance: bigint };
        },
      ]
    >;
    const arg = calls[0][0];
    expect(arg.where).toEqual({ code: 'HGW' });
    expect(arg.update.enabled).toBe(true);
    expect(arg.update.distance).toBe(BigInt(46915892));
  });

  it('no hace nada con un snapshot vacío', async () => {
    const prisma = makePrisma();
    const repo = new RouteRepository(prisma);

    await repo.saveSnapshot({});

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mapea BigInt de la BD a number y null a 0', async () => {
    const prisma = makePrisma();
    prisma.route.findMany.mockResolvedValue([
      {
        code: 'HGW',
        name: 'Hogwarts',
        enabled: true,
        distance: BigInt(100),
        transportCost: null,
      },
    ]);
    const repo = new RouteRepository(prisma);

    const rows = await repo.findAll();

    expect(rows).toEqual([
      {
        code: 'HGW',
        name: 'Hogwarts',
        enabled: true,
        distance: 100,
        transportCost: 0,
      },
    ]);
  });
});
