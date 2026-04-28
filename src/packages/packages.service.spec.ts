/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { PrismaService } from '../prisma.service';
import { CreatePackageDto } from '../dto/package.dto';

type PrismaMock = {
  packageEvent: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };
};

describe('PackagesService', () => {
  let service: PackagesService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      packageEvent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PackagesService>(PackagesService);
  });

  describe('getPackageById (RF2 hotfix)', () => {
    it('queries by packageId ordered by createdAt desc', async () => {
      const expectedEvent = {
        idpk: 'evt-2',
        type: 'package-transit',
        packageId: 'pkg-test-1',
        createdAt: new Date('2026-04-27T12:00:00.000Z'),
      };
      prisma.packageEvent.findFirst.mockResolvedValue(expectedEvent);

      const result = await service.getPackageById('pkg-test-1');

      expect(prisma.packageEvent.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.packageEvent.findFirst).toHaveBeenCalledWith({
        where: { packageId: 'pkg-test-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(expectedEvent);
    });

    it('throws NotFoundException when no event matches the packageId', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(null);

      await expect(service.getPackageById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.packageEvent.findFirst).toHaveBeenCalledWith({
        where: { packageId: 'non-existent' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getPackages', () => {
    beforeEach(() => {
      prisma.packageEvent.findMany.mockResolvedValue([]);
      prisma.packageEvent.count.mockResolvedValue(0);
    });

    it('applies default pagination (page=1, limit=25) and orderBy createdAt desc', async () => {
      const result = await service.getPackages({});

      expect(prisma.packageEvent.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 25,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 0,
      });
    });

    it('computes skip from page and limit', async () => {
      prisma.packageEvent.count.mockResolvedValue(100);

      const result = await service.getPackages({ page: '3', limit: '10' });

      expect(prisma.packageEvent.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 20,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.meta).toEqual({
        total: 100,
        page: 3,
        limit: 10,
        totalPages: 10,
      });
    });

    it('builds a UTC date range when createdAt filter is present', async () => {
      await service.getPackages({ createdAt: '2026-04-27' });

      expect(prisma.packageEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: new Date('2026-04-27T00:00:00.000Z'),
              lte: new Date('2026-04-27T23:59:59.999Z'),
            },
          },
        }),
      );
    });

    it('forwards scalar filters (originId, destinationId, deliveryStrategy, payment) to Prisma', async () => {
      await service.getPackages({
        originId: 'central',
        destinationId: 'HGW',
        deliveryStrategy: 'direct',
        payment: '1500.5',
      });

      expect(prisma.packageEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            originId: 'central',
            destinationId: 'HGW',
            deliveryStrategy: 'direct',
            payment: 1500.5,
          },
        }),
      );
    });
  });

  describe('createPackage', () => {
    const baseDto: CreatePackageDto = {
      idpk: '00000000-0000-0000-0000-000000000001',
      type: 'package-transit',
      packageBody: {
        id: 'pkg-test-1',
        deliveryStrategy: 'direct',
        maxHops: 3,
        createdAt: '2026-04-27T12:00:00.000Z',
        deliverNotBefore: '2026-04-27T18:00:00.000Z',
        originId: 'central',
        destinationId: 'HGW',
        metaContent: '',
        isMetaEncrypted: false,
        constraints: {},
        priorityClass: 'medium',
        payment: 0,
      },
    };

    it('flattens packageBody into PackageEvent fields', async () => {
      prisma.packageEvent.create.mockResolvedValue({ idpk: baseDto.idpk });

      await service.createPackage(baseDto);

      expect(prisma.packageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          idpk: baseDto.idpk,
          type: 'package-transit',
          packageId: 'pkg-test-1',
          deliveryStrategy: 'direct',
          maxHops: 3,
          originId: 'central',
          destinationId: 'HGW',
          isMetaEncrypted: false,
          priorityClass: 'medium',
          payment: 0,
        }),
      });
    });

    it('parses createdAt and deliverNotBefore into Date instances', async () => {
      prisma.packageEvent.create.mockResolvedValue({ idpk: baseDto.idpk });

      await service.createPackage(baseDto);

      const call = prisma.packageEvent.create.mock.calls[0][0] as {
        data: { createdAt: Date; deliverNotBefore: Date | null };
      };
      expect(call.data.createdAt).toBeInstanceOf(Date);
      expect(call.data.createdAt.toISOString()).toBe(
        '2026-04-27T12:00:00.000Z',
      );
      expect(call.data.deliverNotBefore).toBeInstanceOf(Date);
    });

    it('persists null when deliverNotBefore is missing', async () => {
      prisma.packageEvent.create.mockResolvedValue({ idpk: baseDto.idpk });
      const dto: CreatePackageDto = {
        ...baseDto,
        packageBody: { ...baseDto.packageBody, deliverNotBefore: null },
      };

      await service.createPackage(dto);

      const call = prisma.packageEvent.create.mock.calls[0][0] as {
        data: { deliverNotBefore: Date | null };
      };
      expect(call.data.deliverNotBefore).toBeNull();
    });

    it('throws BadRequestException when packageBody is missing', async () => {
      const dto = {
        idpk: 'x',
        type: 'package-transit',
      } as unknown as CreatePackageDto;

      await expect(service.createPackage(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.packageEvent.create).not.toHaveBeenCalled();
    });

    it('wraps Prisma errors into BadRequestException', async () => {
      prisma.packageEvent.create.mockRejectedValue(
        new Error('unique constraint failed'),
      );
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(service.createPackage(baseDto)).rejects.toThrow(
        BadRequestException,
      );

      errorSpy.mockRestore();
    });
  });
});
