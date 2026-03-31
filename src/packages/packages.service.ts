import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  async createPackage(data: any) {
    if (!data.packageBody) {
      throw new BadRequestException('Formato de paquete inválido');
    }

    try {
      const result = await this.prisma.packageEvent.create({
        data: {
          idpk: data.idpk,
          type: data.type,
          packageId: data.packageBody.id,
          deliveryStrategy: data.packageBody.deliveryStrategy,
          maxHops: data.packageBody.maxHops,
          createdAt: new Date(data.packageBody.createdAt),
          deliverNotBefore: data.packageBody.deliverNotBefore
            ? new Date(data.packageBody.deliverNotBefore)
            : null,
          originId: data.packageBody.originId,
          destinationId: data.packageBody.destinationId,
          metaContent: data.packageBody.metaContent,
          isMetaEncrypted: data.packageBody.isMetaEncrypted,
          constraints: data.packageBody.constraints || {},
          priorityClass: data.packageBody.priorityClass,
          payment: data.packageBody.payment,
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

  async getPackages(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 25;
    const skip = (page - 1) * limit;

    // Filtros
    const where: any = {};
    if (query.originId) where.originId = query.originId;
    if (query.destinationId) where.destinationId = query.destinationId;
    if (query.payment) where.payment = parseFloat(query.payment);
    if (query.deliveryStrategy) where.deliveryStrategy = query.deliveryStrategy;

    // Si envían fecha createdAt en el query (ej: 2026-03-01)
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
