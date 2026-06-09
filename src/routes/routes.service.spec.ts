import { RoutesService } from '@/routes/routes.service';
import { RouteRepository } from '@/routing/route.repository';
import { CITY_CATALOG } from '@config/city.config';

function makeService() {
  const routeRepository = {
    findAll: jest.fn().mockResolvedValue([]),
    saveSnapshot: jest.fn().mockResolvedValue(undefined),
  } as unknown as RouteRepository;
  const service = new RoutesService(routeRepository);
  return { service, routeRepository };
}

describe('RoutesService', () => {
  it('devuelve las 17 ciudades del catálogo, deshabilitadas si la BD está vacía', async () => {
    const { service } = makeService();

    const routes = await service.getRoutes();

    expect(routes).toHaveLength(CITY_CATALOG.length);
    expect(routes.every((r) => r.enabled === false)).toBe(true);
    expect(routes.every((r) => r.distance === 0 && r.transportCost === 0)).toBe(
      true,
    );
  });

  it('mezcla la info persistida en BD con el catálogo (RF02)', async () => {
    const { service, routeRepository } = makeService();
    (routeRepository.findAll as jest.Mock).mockResolvedValue([
      {
        code: 'HGW',
        name: 'Hogwarts',
        enabled: true,
        distance: 100,
        transportCost: 10,
      },
    ]);

    const routes = await service.getRoutes();
    const hgw = routes.find((r) => r.code === 'HGW');

    expect(hgw).toEqual({
      code: 'HGW',
      name: 'Hogwarts',
      distance: 100,
      transportCost: 10,
      enabled: true,
    });
    // Una ciudad sin fila en BD sigue apareciendo deshabilitada.
    expect(routes.find((r) => r.code === 'COR')?.enabled).toBe(false);
  });
});
