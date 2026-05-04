import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PackagesService } from '@packages/packages.service';
import { PrismaService } from '@/prisma.service';
import { AuditService } from '@/routing/audit.service';
import { CreatePackageDto } from '@dto/package.dto';

type PrismaMock = {
  packageEvent: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    groupBy: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };
  auditEvent: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
};

const OWN_CITY = 'HGW';

describe('PackagesService', () => {
  let service: PackagesService;
  let prisma: PrismaMock;
  let auditService: { reportDelivered: jest.Mock };
  const originalCityId = process.env.CITY_ID;

  beforeAll(() => {
    process.env.CITY_ID = OWN_CITY;
  });

  afterAll(() => {
    if (originalCityId === undefined) {
      delete process.env.CITY_ID;
    } else {
      process.env.CITY_ID = originalCityId;
    }
  });

  beforeEach(async () => {
    prisma = {
      packageEvent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      auditEvent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    auditService = { reportDelivered: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<PackagesService>(PackagesService);
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          idpk: String(baseDto.idpk),
          type: 'package-transit',
          packageId: 'pkg-test-1',
          maxHops: 3,
          originId: 'central',
          destinationId: 'HGW',
        }),
      });
    });

    it('persists null when deliverNotBefore is missing', async () => {
      prisma.packageEvent.create.mockResolvedValue({ idpk: baseDto.idpk });
      const dto: CreatePackageDto = {
        ...baseDto,
        packageBody: {
          ...baseDto.packageBody,
          deliverNotBefore: undefined,
        },
      };

      await service.createPackage(dto);

      const calls = prisma.packageEvent.create.mock.calls as unknown[][];
      const call = calls[0][0] as {
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

  describe('getPackages', () => {
    const eventForOwnCity = {
      idpk: 'evt-1',
      type: 'package-transit',
      packageId: 'pkg-1',
      deliveryStrategy: 'direct',
      maxHops: 2,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      deliverNotBefore: new Date('2026-04-27T18:00:00.000Z'),
      originId: 'central',
      destinationId: OWN_CITY,
      metaContent: '',
      isMetaEncrypted: false,
      constraints: {},
      priorityClass: 'medium',
      payment: 0,
      receivedAt: new Date('2026-04-27T19:00:00.000Z'),
    };

    const eventForOtherCity = {
      ...eventForOwnCity,
      idpk: 'evt-2',
      packageId: 'pkg-2',
      destinationId: 'COR',
      receivedAt: new Date('2026-04-27T20:00:00.000Z'),
    };

    it('returns one row per packageId with the latest snapshot', async () => {
      prisma.packageEvent.groupBy.mockResolvedValue([
        {
          packageId: 'pkg-1',
          _max: { receivedAt: eventForOwnCity.receivedAt },
        },
        {
          packageId: 'pkg-2',
          _max: { receivedAt: eventForOtherCity.receivedAt },
        },
      ]);
      prisma.packageEvent.findMany.mockImplementation(
        (args: { distinct?: string[] }) => {
          if (args.distinct) {
            return Promise.resolve([
              { packageId: 'pkg-1' },
              { packageId: 'pkg-2' },
            ]);
          }
          return Promise.resolve([eventForOwnCity, eventForOtherCity]);
        },
      );
      prisma.auditEvent.findMany.mockResolvedValue([]);

      const result = await service.getPackages(
        {},
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.meta.total).toBe(2);
      expect(result.data).toHaveLength(2);
      const ids = result.data.map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining(['pkg-1', 'pkg-2']));
    });

    it('marks canDeliver=true only for own-city packages past deliverNotBefore not yet delivered', async () => {
      prisma.packageEvent.groupBy.mockResolvedValue([
        {
          packageId: 'pkg-1',
          _max: { receivedAt: eventForOwnCity.receivedAt },
        },
        {
          packageId: 'pkg-2',
          _max: { receivedAt: eventForOtherCity.receivedAt },
        },
      ]);
      prisma.packageEvent.findMany.mockImplementation(
        (args: { distinct?: string[] }) => {
          if (args.distinct) {
            return Promise.resolve([
              { packageId: 'pkg-1' },
              { packageId: 'pkg-2' },
            ]);
          }
          return Promise.resolve([eventForOwnCity, eventForOtherCity]);
        },
      );
      prisma.auditEvent.findMany.mockResolvedValue([
        {
          packageId: 'pkg-1',
          type: 'received',
          createdAt: new Date('2026-04-27T19:30:00.000Z'),
        },
      ]);

      const result = await service.getPackages(
        {},
        new Date('2026-04-28T00:00:00.000Z'),
      );

      const pkg1 = result.data.find((p) => p.id === 'pkg-1')!;
      const pkg2 = result.data.find((p) => p.id === 'pkg-2')!;
      expect(pkg1.canDeliver).toBe(true);
      expect(pkg1.lastAction).toBe('received');
      expect(pkg2.canDeliver).toBe(false);
    });

    it('canDeliver=false when deliverNotBefore is in the future', async () => {
      prisma.packageEvent.groupBy.mockResolvedValue([
        {
          packageId: 'pkg-1',
          _max: { receivedAt: eventForOwnCity.receivedAt },
        },
      ]);
      prisma.packageEvent.findMany.mockImplementation(
        (args: { distinct?: string[] }) => {
          if (args.distinct) {
            return Promise.resolve([{ packageId: 'pkg-1' }]);
          }
          return Promise.resolve([eventForOwnCity]);
        },
      );
      prisma.auditEvent.findMany.mockResolvedValue([]);

      const result = await service.getPackages(
        {},
        new Date('2026-04-27T17:00:00.000Z'),
      );

      expect(result.data[0].canDeliver).toBe(false);
    });

    it('canDeliver=false when last action is delivered', async () => {
      prisma.packageEvent.groupBy.mockResolvedValue([
        {
          packageId: 'pkg-1',
          _max: { receivedAt: eventForOwnCity.receivedAt },
        },
      ]);
      prisma.packageEvent.findMany.mockImplementation(
        (args: { distinct?: string[] }) => {
          if (args.distinct) {
            return Promise.resolve([{ packageId: 'pkg-1' }]);
          }
          return Promise.resolve([eventForOwnCity]);
        },
      );
      prisma.auditEvent.findMany.mockResolvedValue([
        {
          packageId: 'pkg-1',
          type: 'delivered',
          createdAt: new Date('2026-04-27T20:00:00.000Z'),
        },
        {
          packageId: 'pkg-1',
          type: 'received',
          createdAt: new Date('2026-04-27T19:00:00.000Z'),
        },
      ]);

      const result = await service.getPackages(
        {},
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.data[0].lastAction).toBe('delivered');
      expect(result.data[0].canDeliver).toBe(false);
    });
  });

  describe('getPackageById', () => {
    it('returns the latest snapshot with last action', async () => {
      const evt = {
        idpk: 'evt-1',
        packageId: 'pkg-1',
        type: 'package-transit',
        deliveryStrategy: 'direct',
        maxHops: 1,
        createdAt: new Date('2026-04-27T12:00:00.000Z'),
        deliverNotBefore: null,
        originId: 'central',
        destinationId: OWN_CITY,
        metaContent: '',
        isMetaEncrypted: false,
        constraints: {},
        priorityClass: 'medium',
        payment: 0,
        receivedAt: new Date('2026-04-27T19:00:00.000Z'),
      };
      prisma.packageEvent.findFirst.mockResolvedValue(evt);
      prisma.auditEvent.findFirst.mockResolvedValue({ type: 'received' });

      const result = await service.getPackageById(
        'pkg-1',
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.id).toBe('pkg-1');
      expect(result.lastAction).toBe('received');
      expect(result.canDeliver).toBe(true);
    });

    it('throws NotFoundException when no event matches', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(null);
      await expect(service.getPackageById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deliverPackage (idempotency)', () => {
    const ownPackage = {
      idpk: 'evt-1',
      packageId: 'pkg-1',
      type: 'package-transit',
      deliveryStrategy: 'direct',
      maxHops: 1,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      deliverNotBefore: new Date('2026-04-27T18:00:00.000Z'),
      originId: 'central',
      destinationId: OWN_CITY,
      metaContent: '',
      isMetaEncrypted: false,
      constraints: {},
      priorityClass: 'medium',
      payment: 0,
      receivedAt: new Date('2026-04-27T19:00:00.000Z'),
    };

    it('throws NotFound when package does not exist', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(null);
      await expect(service.deliverPackage('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when destinationId is not the own city', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue({
        ...ownPackage,
        destinationId: 'COR',
      });
      await expect(service.deliverPackage('pkg-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when current time is before deliverNotBefore', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(ownPackage);
      await expect(
        service.deliverPackage(
          'pkg-1',
          undefined,
          new Date('2026-04-27T17:00:00.000Z'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns alreadyDelivered when a delivered audit already exists', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(ownPackage);
      const existing = {
        idpk: 'delivered:pkg-1',
        type: 'delivered',
        createdAt: new Date('2026-04-27T20:00:00.000Z'),
      };
      prisma.auditEvent.findFirst.mockResolvedValue(existing);

      const result = await service.deliverPackage(
        'pkg-1',
        undefined,
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.alreadyDelivered).toBe(true);
      expect(result.idpk).toBe('delivered:pkg-1');
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    });

    it('creates a delivered audit, reports to broker, and returns idpk', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(ownPackage);
      prisma.auditEvent.findFirst.mockResolvedValue(null);
      prisma.auditEvent.create.mockResolvedValue({
        idpk: 'delivered:pkg-1',
        packageId: 'pkg-1',
        type: 'delivered',
        createdAt: new Date('2026-04-28T00:00:00.000Z'),
      });

      const result = await service.deliverPackage(
        'pkg-1',
        undefined,
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.delivered).toBe(true);
      expect(result.alreadyDelivered).toBe(false);
      expect(result.idpk).toBe('delivered:pkg-1');
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: {
          idpk: 'delivered:pkg-1',
          packageId: 'pkg-1',
          type: 'delivered',
        },
      });
      expect(auditService.reportDelivered).toHaveBeenCalledWith('pkg-1');
    });

    it('uses caller-provided idpk when present', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(ownPackage);
      prisma.auditEvent.findFirst.mockResolvedValue(null);
      prisma.auditEvent.create.mockResolvedValue({
        idpk: 'caller-idpk',
        packageId: 'pkg-1',
        type: 'delivered',
        createdAt: new Date('2026-04-28T00:00:00.000Z'),
      });

      await service.deliverPackage(
        'pkg-1',
        'caller-idpk',
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: {
          idpk: 'caller-idpk',
          packageId: 'pkg-1',
          type: 'delivered',
        },
      });
    });

    it('treats P2002 race as alreadyDelivered', async () => {
      prisma.packageEvent.findFirst.mockResolvedValue(ownPackage);
      prisma.auditEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          idpk: 'delivered:pkg-1',
          type: 'delivered',
          createdAt: new Date('2026-04-28T00:00:01.000Z'),
        });
      prisma.auditEvent.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.deliverPackage(
        'pkg-1',
        undefined,
        new Date('2026-04-28T00:00:00.000Z'),
      );

      expect(result.alreadyDelivered).toBe(true);
    });
  });
});
