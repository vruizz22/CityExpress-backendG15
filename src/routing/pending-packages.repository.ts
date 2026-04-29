import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PackageEvent } from '@prisma/client';
import { PackageTransitMessage } from '@/messaging/message.types';
import { buildPackageEventData } from '@packages/package-event.mapper';

@Injectable()
export class PendingPackagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async savePendingDelivery(message: PackageTransitMessage): Promise<void> {
    await this.upsertPending(message, 'pending-delivery');
  }

  async savePendingRoute(message: PackageTransitMessage): Promise<void> {
    await this.upsertPending(message, 'pending-route');
  }

  async findPendingDeliveriesReady(now: Date): Promise<PackageEvent[]> {
    return this.prisma.packageEvent.findMany({
      where: {
        type: 'pending-delivery',
        deliverNotBefore: { lte: now },
      },
      orderBy: { deliverNotBefore: 'asc' },
    });
  }

  async findPendingRoutes(): Promise<PackageEvent[]> {
    return this.prisma.packageEvent.findMany({
      where: {
        type: 'pending-route',
      },
    });
  }

  async removePending(idpk: string): Promise<void> {
    await this.prisma.packageEvent.delete({
      where: { idpk },
    });
  }

  private async upsertPending(
    message: PackageTransitMessage,
    type: 'pending-delivery' | 'pending-route',
  ): Promise<void> {
    const senderCityId = message.cityId ?? null;
    await this.prisma.packageEvent.upsert({
      where: { idpk: message.idpk },
      create: buildPackageEventData({
        idpk: message.idpk,
        type,
        packageBody: message.packageBody,
        senderCityId,
      }),
      update: { type, senderCityId },
    });
  }
}
