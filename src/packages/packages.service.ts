import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PackageEvent, AuditEvent } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import {
  CreatePackageDto,
  CreatePackageDtoSchema,
  GetPackagesQuery,
  PackageView,
} from '@dto/package.dto';
import { buildPackageEventData } from '@packages/package-event.mapper';
import { getOwnCityId } from '@config/city.config';
import { AuditService } from '@/routing/audit.service';

export const DELIVERED_AUDIT_TYPE = 'delivered';

@Injectable()
export class PackagesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createPackage(data: CreatePackageDto) {
    const parsed = CreatePackageDtoSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException('Formato de paquete inválido');
    }

    try {
      const body = parsed.data.packageBody;
      const result = await this.prisma.packageEvent.create({
        data: buildPackageEventData({
          idpk: parsed.data.idpk,
          type: parsed.data.type,
          packageBody: body,
        }),
      });
      return result;
    } catch (err) {
      console.error(err);
      throw new BadRequestException(
        'Error guardando paquete (posible duplicado de idpk o campos inválidos).',
      );
    }
  }

  async getPackages(query: GetPackagesQuery, now: Date = new Date()) {
    const page = parseInt(query.page || '1', 10) || 1;
    const limit = parseInt(query.limit || '25', 10) || 25;
    const skip = (page - 1) * limit;

    const groups = await this.prisma.packageEvent.groupBy({
      by: ['packageId'],
      _max: { receivedAt: true },
      orderBy: { _max: { receivedAt: 'desc' } },
      skip,
      take: limit,
    });

    const totalGroups = await this.prisma.packageEvent.findMany({
      distinct: ['packageId'],
      select: { packageId: true },
    });
    const total = totalGroups.length;

    const packageIds = groups.map((g) => g.packageId);
    if (packageIds.length === 0) {
      return {
        data: [],
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    const lastEvents = await this.prisma.packageEvent.findMany({
      where: {
        OR: groups.map((g) => ({
          packageId: g.packageId,
          receivedAt: g._max.receivedAt ?? undefined,
        })),
      },
    });
    const lastEventByPkg = new Map<string, PackageEvent>(
      lastEvents.map((e) => [e.packageId, e]),
    );

    const audits = await this.prisma.auditEvent.findMany({
      where: { packageId: { in: packageIds } },
      orderBy: { createdAt: 'desc' },
    });
    const lastActionByPkg = new Map<string, string>();
    for (const a of audits) {
      if (!lastActionByPkg.has(a.packageId)) {
        lastActionByPkg.set(a.packageId, a.type);
      }
    }

    const ownCityId = getOwnCityId();
    const data: PackageView[] = packageIds
      .map((pid) => lastEventByPkg.get(pid))
      .filter((e): e is PackageEvent => !!e)
      .map((evt) =>
        this.toView(evt, lastActionByPkg.get(evt.packageId), now, ownCityId),
      );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPackageById(id: string, now: Date = new Date()) {
    const pkg = await this.prisma.packageEvent.findFirst({
      where: { packageId: id },
      orderBy: { receivedAt: 'desc' },
    });
    if (!pkg) {
      throw new NotFoundException('Paquete no encontrado');
    }

    const lastAudit = await this.prisma.auditEvent.findFirst({
      where: { packageId: id },
      orderBy: { createdAt: 'desc' },
    });

    return this.toView(pkg, lastAudit?.type, now, getOwnCityId());
  }

  async deliverPackage(
    packageId: string,
    idpk?: string,
    now: Date = new Date(),
  ) {
    const last = await this.prisma.packageEvent.findFirst({
      where: { packageId },
      orderBy: { receivedAt: 'desc' },
    });
    if (!last) {
      throw new NotFoundException('Paquete no encontrado');
    }

    const ownCityId = getOwnCityId();
    if (last.destinationId !== ownCityId) {
      throw new BadRequestException(
        'El paquete no tiene como destino esta ciudad.',
      );
    }

    if (
      last.deliverNotBefore &&
      last.deliverNotBefore.getTime() > now.getTime()
    ) {
      throw new BadRequestException(
        'El paquete no puede entregarse antes de deliverNotBefore.',
      );
    }

    const existing = await this.prisma.auditEvent.findFirst({
      where: { packageId, type: DELIVERED_AUDIT_TYPE },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return {
        packageId,
        delivered: true,
        alreadyDelivered: true,
        idpk: existing.idpk,
        deliveredAt: existing.createdAt,
      };
    }

    const auditIdpk = idpk ?? `delivered:${packageId}`;

    try {
      const audit: AuditEvent = await this.prisma.auditEvent.create({
        data: {
          idpk: auditIdpk,
          packageId,
          type: DELIVERED_AUDIT_TYPE,
        },
      });
      await this.auditService.reportDelivered(packageId);
      return {
        packageId,
        delivered: true,
        alreadyDelivered: false,
        idpk: audit.idpk,
        deliveredAt: audit.createdAt,
      };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        const after = await this.prisma.auditEvent.findFirst({
          where: { packageId, type: DELIVERED_AUDIT_TYPE },
          orderBy: { createdAt: 'asc' },
        });
        if (after) {
          return {
            packageId,
            delivered: true,
            alreadyDelivered: true,
            idpk: after.idpk,
            deliveredAt: after.createdAt,
          };
        }
        throw new ConflictException(
          'Conflicto de idempotencia al registrar la entrega.',
        );
      }
      throw err;
    }
  }

  private toView(
    evt: PackageEvent,
    lastAction: string | undefined,
    now: Date,
    ownCityId: string,
  ): PackageView {
    const isMine = evt.destinationId === ownCityId;
    const releaseOk =
      !evt.deliverNotBefore || evt.deliverNotBefore.getTime() <= now.getTime();
    const notDelivered = lastAction !== DELIVERED_AUDIT_TYPE;
    const canDeliver = isMine && releaseOk && notDelivered;

    return {
      id: evt.packageId,
      originId: evt.originId,
      destinationId: evt.destinationId,
      maxHops: evt.maxHops,
      createdAt: evt.createdAt,
      deliverNotBefore: evt.deliverNotBefore,
      lastAction: lastAction ?? null,
      receivedAt: evt.receivedAt,
      canDeliver,
    };
  }
}
