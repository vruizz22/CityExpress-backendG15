import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PackageTransitMessage } from '@/messaging/message.types';
import { buildPackageEventData } from '@packages/package-event.mapper';

type RecordResult = 'created' | 'duplicate';

@Injectable()
export class PackageEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordInbound(
    message: PackageTransitMessage,
    senderCityId: string | null,
  ): Promise<RecordResult> {
    try {
      await this.prisma.packageEvent.create({
        data: buildPackageEventData({
          idpk: message.idpk,
          type: message.type,
          packageBody: message.packageBody,
          senderCityId,
        }),
      });
      return 'created';
    } catch (error) {
      const maybeError = error as { code?: string };
      if (maybeError && typeof maybeError.code === 'string') {
        if (maybeError.code === 'P2002') {
          return 'duplicate';
        }
      }
      throw error;
    }
  }
}
