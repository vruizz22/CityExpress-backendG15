import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

export type AuditEventType =
  | 'received'
  | 'transit'
  | 'transit-redirect'
  | 'expired'
  | 'delivered';

export interface RecordAuditInput {
  idpk: string;
  packageId: string;
  type: AuditEventType;
  data?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput) {
    try {
      return await this.prisma.auditEvent.create({
        data: {
          idpk: input.idpk,
          packageId: input.packageId,
          type: input.type,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        return this.prisma.auditEvent.findUnique({
          where: { idpk: input.idpk },
        });
      }
      throw err;
    }
  }

  listByPackage(packageId: string) {
    return this.prisma.auditEvent.findMany({
      where: { packageId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
