import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '@audit/audit.service';
import { PrismaService } from '@/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditEvent: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('persists an audit event with the given idpk and type', async () => {
    prisma.auditEvent.create.mockResolvedValue({
      idpk: 'a-1',
      packageId: 'pkg-1',
      type: 'received',
    });

    await service.record({
      idpk: 'a-1',
      packageId: 'pkg-1',
      type: 'received',
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        idpk: 'a-1',
        packageId: 'pkg-1',
        type: 'received',
        data: undefined,
      },
    });
  });

  it('on duplicate idpk (P2002) returns existing record without throwing', async () => {
    prisma.auditEvent.create.mockRejectedValue({ code: 'P2002' });
    prisma.auditEvent.findUnique.mockResolvedValue({
      idpk: 'a-1',
      packageId: 'pkg-1',
      type: 'received',
    });

    const result = await service.record({
      idpk: 'a-1',
      packageId: 'pkg-1',
      type: 'received',
    });
    expect(result).toEqual(
      expect.objectContaining({ idpk: 'a-1', type: 'received' }),
    );
  });

  it('rethrows non-P2002 errors', async () => {
    prisma.auditEvent.create.mockRejectedValue(new Error('boom'));
    await expect(
      service.record({
        idpk: 'a-1',
        packageId: 'pkg-1',
        type: 'received',
      }),
    ).rejects.toThrow('boom');
  });

  it('listByPackage returns events ordered by createdAt asc', async () => {
    prisma.auditEvent.findMany.mockResolvedValue([]);
    await service.listByPackage('pkg-1');
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
      where: { packageId: 'pkg-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});
