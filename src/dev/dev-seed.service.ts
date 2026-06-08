import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DistanceTableService } from '@/routing/distance-table.service';
import { DistanceTableEntry } from '@/messaging/message.types';

@Injectable()
export class DevSeedService implements OnModuleInit {
  private readonly logger = new Logger(DevSeedService.name);

  constructor(private readonly distanceTable: DistanceTableService) {}

  onModuleInit(): void {
    if (process.env.SEED_ROUTES !== 'true') return;
    const entry = (
      code: string,
      name: string,
      distance: number,
      transportCost: number,
    ): DistanceTableEntry => ({
      destinationCode: code,
      destinationName: name,
      distance,
      transportCost,
      enabled: true,
    });
    const distances: Record<string, DistanceTableEntry> = {
      COR: entry('COR', 'Coruscant', 9000, 12000),
      HGW: entry('HGW', 'Hogwarts', 15000, 20000),
      TRA: entry('TRA', 'Trantor', 6000, 5000),
      RNC: entry('RNC', 'Rancagua', 4000, 5000),
      TAL: entry('TAL', 'Talca', 7000, 8000),
    };
    this.distanceTable.updateDistances(distances);
    this.logger.log(
      `[DEV] snapshot de rutas sembrado: ${Object.keys(distances).join(', ')}`,
    );
  }
}
