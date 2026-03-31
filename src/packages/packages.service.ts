import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CreatePackageDto, GetPackagesQuery } from '@dto/package.dto';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  async createPackage(data: CreatePackageDto) {
    if (!data.packageBody) {
      throw new BadRequestException('Formato de paquete inválido');
    }

    try {
      const body = data.packageBody;
      const result = await this.prisma.packageEvent.create({
        data: {
          idpk: data.idpk,
          type: data.type,
          packageId: body.id,
          deliveryStrategy: body.deliveryStrategy,
          maxHops: body.maxHops,
          createdAt: new Date(body.createdAt),
          deliverNotBefore: body.deliverNotBefore
            ? new Date(body.deliverNotBefore)
            : null,
          originId: body.originId,
          destinationId: body.destinationId,
          metaContent: body.metaContent,
          isMetaEncrypted: body.isMetaEncrypted,
          constraints: (body.constraints ?? {}) as Prisma.InputJsonValue,
          priorityClass: body.priorityClass,
          payment: Number(body.payment),
        },
      });
      return result;
    } catch (err) {
      console.error(err);
      throw new BadRequestException(
        'Error guardando paquete (posible duplicado de idpk o campos inválidos).',
      );
    }
  }

  async getPackages(query: GetPackagesQuery) {
    const page = parseInt(query.page || '1', 10) || 1;
    const limit = parseInt(query.limit || '25', 10) || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.originId) where.originId = query.originId;
    if (query.destinationId) where.destinationId = query.destinationId;
    if (query.payment) where.payment = parseFloat(query.payment);
    if (query.deliveryStrategy) where.deliveryStrategy = query.deliveryStrategy;

    if (query.createdAt) {
      where.createdAt = {
        gte: new Date(`${query.createdAt}T00:00:00.000Z`),
        lte: new Date(`${query.createdAt}T23:59:59.999Z`),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.packageEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.packageEvent.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPackageById(id: string) {
    const pkg = await this.prisma.packageEvent.findUnique({
      where: { idpk: id },
    });
    if (!pkg) {
      throw new NotFoundException('Paquete no encontrado');
    }
    return pkg;
  }
}
