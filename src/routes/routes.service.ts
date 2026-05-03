import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CITY_CATALOG, getOwnCityId } from '@config/city.config';

export interface RouteView {
  code: string;
  name: string;
  enabled: boolean;
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoutes(): Promise<{
    cityId: string;
    data: RouteView[];
  }> {
    const ownCity = getOwnCityId();
    const stored = await this.prisma.route.findMany();
    const byCode = new Map(stored.map((r) => [r.code, r]));

    const data: RouteView[] = CITY_CATALOG.filter(
      (c) => c.code !== ownCity,
    ).map((city) => {
      const row = byCode.get(city.code);
      return {
        code: city.code,
        name: city.name,
        enabled: row?.enabled ?? false,
      };
    });

    return { cityId: ownCity, data };
  }
}
