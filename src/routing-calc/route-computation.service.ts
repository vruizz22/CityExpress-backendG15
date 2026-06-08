import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CITY_CODES, getCityName, getOwnCityId } from '@config/city.config';
import { DistanceTableEntry } from '@/messaging/message.types';
import { ReceivedTableRepository } from './received-table.repository';
import {
  buildAdjacency,
  CityTables,
  Criteria,
  pathTo,
  shortestPaths,
  ShortestPath,
} from './dijkstra';

@Injectable()
export class RouteComputationService {
  private readonly logger = new Logger(RouteComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receivedTables: ReceivedTableRepository,
  ) {}

  async getRoute(
    destinationId: string,
    criteria: Criteria,
  ): Promise<ShortestPath> {
    const existing = await this.prisma.calculatedRoute.findUnique({
      where: {
        destinationCode_criteria: { destinationCode: destinationId, criteria },
      },
    });
    if (existing) {
      return this.toShortestPath(existing);
    }
    await this.compute(criteria);
    const recomputed = await this.prisma.calculatedRoute.findUnique({
      where: {
        destinationCode_criteria: { destinationCode: destinationId, criteria },
      },
    });
    if (!recomputed) {
      return {
        cost: Infinity,
        hops: 0,
        path: [],
        nextHop: null,
        reachable: false,
      };
    }
    return this.toShortestPath(recomputed);
  }

  private toShortestPath(row: {
    routeMetricCost: bigint | null;
    hops: number | null;
    path: unknown;
    nextHop: string | null;
    reachable: boolean;
  }): ShortestPath {
    return {
      cost:
        row.routeMetricCost != null ? Number(row.routeMetricCost) : Infinity,
      hops: row.hops ?? 0,
      path: (row.path as string[]) ?? [],
      nextHop: row.nextHop,
      reachable: row.reachable,
    };
  }

  async compute(criteria: Criteria): Promise<void> {
    const source = getOwnCityId();
    const job = await this.prisma.job.create({
      data: {
        type: 'route-computation',
        status: 'running',
        payload: { criteria },
      },
    });
    try {
      const tables = await this.buildTables();
      const adjacency = buildAdjacency(tables, criteria);
      const paths = shortestPaths(adjacency, source);

      for (const code of CITY_CODES) {
        if (code === source) continue;
        const sp = pathTo(paths, code);
        const data = {
          routeMetricCost: sp.reachable ? BigInt(Math.round(sp.cost)) : null,
          hops: sp.reachable ? sp.hops : null,
          path: sp.path as unknown as Prisma.InputJsonValue,
          nextHop: sp.nextHop,
          reachable: sp.reachable,
        };
        await this.prisma.calculatedRoute.upsert({
          where: {
            destinationCode_criteria: { destinationCode: code, criteria },
          },
          update: data,
          create: { destinationCode: code, criteria, ...data },
        });
      }

      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'done', result: { criteria, computed: true } },
      });
    } catch (err) {
      this.logger.error(
        `Fallo el cómputo de rutas (${criteria})`,
        err as Error,
      );
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', result: { error: String(err) } },
      });
      throw err;
    }
  }

  private async buildTables(): Promise<CityTables> {
    const tables = await this.receivedTables.getAllTables();
    const source = getOwnCityId();
    const ownEdges: Record<string, DistanceTableEntry> = {
      ...(tables[source] ?? {}),
    };
    const routes = await this.prisma.route.findMany();
    for (const r of routes) {
      ownEdges[r.code] = {
        destinationCode: r.code,
        destinationName: r.name ?? getCityName(r.code) ?? r.code,
        distance: r.distance != null ? Number(r.distance) : Infinity,
        transportCost:
          r.transportCost != null ? Number(r.transportCost) : Infinity,
        enabled: r.enabled,
      };
    }
    tables[source] = ownEdges;
    return tables;
  }
}
