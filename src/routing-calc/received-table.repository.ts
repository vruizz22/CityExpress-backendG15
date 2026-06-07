import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { DistanceTableEntry } from '@/messaging/message.types';
import { CityTables } from './dijkstra';

type Distances = Record<string, DistanceTableEntry>;

// RF06
@Injectable()
export class ReceivedTableRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertTable(sourceCityId: string, distances: Distances): Promise<void> {
    const data = distances as unknown as Prisma.InputJsonValue;
    await this.prisma.receivedTable.upsert({
      where: { sourceCityId },
      update: { distances: data, receivedAt: new Date() },
      create: { sourceCityId, distances: data },
    });
  }

  async getAllTables(): Promise<CityTables> {
    const rows = await this.prisma.receivedTable.findMany();
    const tables: CityTables = {};
    for (const row of rows) {
      tables[row.sourceCityId] = row.distances as unknown as Distances;
    }
    return tables;
  }
}
