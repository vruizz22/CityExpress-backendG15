import { Injectable } from '@nestjs/common';
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
    return Object.values(snapshot).map((entry) => ({
      code: entry.destinationCode,
      name: entry.destinationName,
      distance: entry.distance,
      transportCost: entry.transportCost,
      enabled: entry.enabled,
    }));
  }
}
