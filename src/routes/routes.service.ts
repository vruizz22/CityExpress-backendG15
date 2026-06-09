import { Injectable } from '@nestjs/common';
import { CITY_CATALOG } from '@config/city.config';
import { RouteRepository } from '@/routing/route.repository';

@Injectable()
export class RoutesService {
  constructor(private readonly routeRepository: RouteRepository) {}

  async getRoutes(): Promise<
    Array<{
      code: string;
      name: string;
      distance: number;
      transportCost: number;
      enabled: boolean;
    }>
  > {
    // Leemos de la BD (no del snapshot en memoria): el master corre como varios
    // procesos y el snapshot vive solo en el proceso que consumió la tabla, así
    // que /routes era intermitente. La BD es consistente entre procesos.
    const rows = await this.routeRepository.findAll();
    const byCode = new Map(rows.map((r) => [r.code, r]));
    return CITY_CATALOG.map((city) => {
      const entry = byCode.get(city.code);
      return {
        code: city.code,
        name: city.name,
        distance: entry?.distance ?? 0,
        transportCost: entry?.transportCost ?? 0,
        enabled: entry?.enabled ?? false,
      };
    });
  }
}
