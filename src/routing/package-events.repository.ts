import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PackageTransitMessage } from '@/messaging/message.types';
import { PackageBody } from '@dto/package.dto';
import { buildPackageEventData } from '@packages/package-event.mapper';

type RecordResult = 'created' | 'duplicate';

@Injectable()
export class PackageEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordInbound(
    message: PackageTransitMessage,
    senderCityId: string | null,
  ): Promise<RecordResult> {
    return this.create({
      idpk: message.idpk,
      type: message.type,
      packageBody: message.packageBody,
      senderCityId,
    });
  }

  /**
   * RF04/RNF07 — marca idempotente del envío inicial post-pago. Usa un idpk
   * determinístico por paquete (`initial:<packageId>`) → si ya existe, devuelve
   * 'duplicate' y el caller no vuelve a publicar (callbacks Webpay duplicados).
   */
  async recordInitialSent(
    packageBody: PackageBody,
    senderCityId: string,
  ): Promise<RecordResult> {
    return this.create({
      idpk: `initial:${packageBody.id}`,
      type: 'initial-sent',
      packageBody,
      senderCityId,
    });
  }

  private async create(input: {
    idpk: string;
    type: string;
    packageBody: PackageBody;
    senderCityId: string | null;
  }): Promise<RecordResult> {
    try {
      await this.prisma.packageEvent.create({
        data: buildPackageEventData(input),
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
