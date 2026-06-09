import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { DistanceTableEntry } from '@/messaging/message.types';

export interface RouteRow {
  code: string;
  name: string;
  enabled: boolean;
  distance: number;
  transportCost: number;
}

/**
 * Persiste la tabla de distancias propia en la BD (modelo `Route`). El snapshot
 * en memoria de `DistanceTableService` NO basta: el master corre como varios
 * procesos (cada uno con su copia) y el broker entrega cada mensaje a UN solo
 * consumidor, así que solo un proceso tendría la tabla; además se pierde en cada
 * reinicio (OOM). Guardando en BD, `GET /routes` es consistente entre procesos y
 * sobrevive reinicios. RF02.
 */
@Injectable()
export class RouteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveSnapshot(
    distances: Record<string, DistanceTableEntry>,
  ): Promise<void> {
    const entries = Object.values(distances);
    if (entries.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.route.upsert({
          where: { code: e.destinationCode },
          update: {
            name: e.destinationName,
            enabled: e.enabled,
            distance: toBigInt(e.distance),
            transportCost: toBigInt(e.transportCost),
          },
          create: {
            code: e.destinationCode,
            name: e.destinationName,
            enabled: e.enabled,
            distance: toBigInt(e.distance),
            transportCost: toBigInt(e.transportCost),
          },
        }),
      ),
    );
  }

  async findAll(): Promise<RouteRow[]> {
    const rows = await this.prisma.route.findMany();
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      enabled: r.enabled,
      distance: r.distance == null ? 0 : Number(r.distance),
      transportCost: r.transportCost == null ? 0 : Number(r.transportCost),
    }));
  }
}

function toBigInt(value: number): bigint {
  return BigInt(Math.trunc(Number.isFinite(value) ? value : 0));
}
