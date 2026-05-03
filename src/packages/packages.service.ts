import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import {
  CreatePackageDto,
  CreatePackageDtoSchema,
  GetPackagesQuery,
} from '@dto/package.dto';
import { buildPackageEventData } from '@packages/package-event.mapper';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

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
    const pkg = await this.prisma.packageEvent.findFirst({
      where: { packageId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!pkg) {
      throw new NotFoundException('Paquete no encontrado');
    }
    return pkg;
  }
}
