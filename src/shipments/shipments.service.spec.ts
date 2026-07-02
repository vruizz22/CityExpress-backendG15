import { ShipmentsService } from './shipments.service';
import { PrismaService } from '@/prisma.service';
import { RouteComputationService } from '@/routing-calc/route-computation.service';
import { EventsService } from '@/events/events.service';

function makeService(route?: Record<string, unknown>) {
  const routeComputation = {
    getRoute: jest.fn().mockResolvedValue({
      reachable: true,
      cost: 10000,
      hops: 1,
      nextHop: 'TAL',
      path: ['HGW', 'TAL'],
      ...route,
    }),
  };
  const service = new ShipmentsService(
    {} as unknown as PrismaService,
    routeComputation as unknown as RouteComputationService,
    { publish: jest.fn() } as unknown as EventsService,
  );
  return service;
}

const base = {
  destinationId: 'COR',
  height: 100,
  width: 100,
  depth: 100,
  criteria: 'distance' as const,
  maxHops: 5,
};

describe('ShipmentsService.quote — recargos RF02/RF03', () => {
  beforeAll(() => {
    process.env.F_PRICE = '1';
  });

  it('sin prioridad ni seguro devuelve el precio base', async () => {
    const service = makeService();
    const q = await service.quote(base);
    // 0.01 * 300 * 10000 * 1 = 30000
    expect(q.baseAmount).toBe(30000);
    expect(q.amount).toBe(30000);
    expect(q.priorityFactor).toBe(1);
    expect(q.insured).toBe(false);
  });

  it('prioridad high multiplica por 2.5', async () => {
    const service = makeService();
    const q = await service.quote({ ...base, priorityClass: 'high' });
    expect(q.amount).toBe(75000);
    expect(q.priorityFactor).toBe(2.5);
  });

  it('seguro suma la prima del 5% sobre el precio ya ajustado', async () => {
    const service = makeService();
    const q = await service.quote({
      ...base,
      priorityClass: 'high',
      insured: true,
    });
    // 30000 * 2.5 * 1.05 = 78750
    expect(q.amount).toBe(78750);
    expect(q.insured).toBe(true);
  });

  it('prioridad low aplica factor 0.5', async () => {
    const service = makeService();
    const q = await service.quote({ ...base, priorityClass: 'low' });
    expect(q.amount).toBe(15000);
  });
});
