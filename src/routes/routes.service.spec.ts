import { Test, TestingModule } from '@nestjs/testing';
import { RoutesService } from '@routes/routes.service';
import { PrismaService } from '@/prisma.service';
import { CITY_CATALOG } from '@config/city.config';

describe('RoutesService', () => {
  let service: RoutesService;
  let prisma: { route: { findMany: jest.Mock } };
  const originalCity = process.env.CITY_ID;

  beforeAll(() => {
    process.env.CITY_ID = 'HGW';
  });

  afterAll(() => {
    if (originalCity === undefined) {
      delete process.env.CITY_ID;
    } else {
      process.env.CITY_ID = originalCity;
    }
  });

  beforeEach(async () => {
    prisma = { route: { findMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<RoutesService>(RoutesService);
  });

  it('returns one entry per known city excluding own city', async () => {
    prisma.route.findMany.mockResolvedValue([]);

    const result = await service.getRoutes();

    expect(result.cityId).toBe('HGW');
    expect(result.data).toHaveLength(CITY_CATALOG.length - 1);
    expect(result.data.every((r) => r.code !== 'HGW')).toBe(true);
  });

  it('defaults enabled=false when no row exists for that city', async () => {
    prisma.route.findMany.mockResolvedValue([]);
    const result = await service.getRoutes();
    expect(result.data.every((r) => r.enabled === false)).toBe(true);
  });

  it('uses stored enabled value when present', async () => {
    prisma.route.findMany.mockResolvedValue([
      { code: 'COR', name: 'Coruscant', enabled: true },
      { code: 'TRA', name: 'Trantor', enabled: false },
    ]);
    const result = await service.getRoutes();
    const cor = result.data.find((r) => r.code === 'COR')!;
    const tra = result.data.find((r) => r.code === 'TRA')!;
    expect(cor.enabled).toBe(true);
    expect(tra.enabled).toBe(false);
  });

  it('exposes the catalog name (not the stored name) for stable display', async () => {
    prisma.route.findMany.mockResolvedValue([
      { code: 'COR', name: 'OLD-NAME', enabled: true },
    ]);
    const result = await service.getRoutes();
    const cor = result.data.find((r) => r.code === 'COR')!;
    expect(cor.name).toBe('Coruscant');
  });
});
