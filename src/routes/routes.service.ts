import { Injectable } from '@nestjs/common';
import { CITY_CATALOG } from '@config/city.config';
import { DistanceTableService } from '@/routing/distance-table.service';

@Injectable()
export class RoutesService {
  constructor(private readonly distanceTable: DistanceTableService) {}

  getRoutes(): Array<{
    code: string;
    name: string;
    distance: number;
    transportCost: number;
    enabled: boolean;
  }> {
    const snapshot = this.distanceTable.getSnapshot();
    return CITY_CATALOG.map((city) => {
      const entry = snapshot[city.code];
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
