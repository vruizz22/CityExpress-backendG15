import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { getOwnCityId } from '@config/city.config';
import { AuthUser } from '@/auth/auth-user.interface';
import {
  CreateShipmentRequest,
  CreateShipmentRequestSchema,
  QuoteRequest,
  QuoteRequestSchema,
  QuoteResult,
} from '@dto/shipment.dto';
import { RouteComputationService } from '@/routing-calc/route-computation.service';
import { computeAmount, dimensionsValid, getFPrice } from '@/payments/pricing';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeComputation: RouteComputationService,
  ) {}

  // RF02
  async quote(input: QuoteRequest): Promise<QuoteResult> {
    const parsed = QuoteRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Datos de cotización inválidos');
    }
    const data = parsed.data;
    if (!dimensionsValid(data.height, data.width, data.depth)) {
      throw new BadRequestException(
        'Dimensiones inválidas: h+w+d debe ser > 0 y <= 3000 cm.',
      );
    }

    const route = await this.routeComputation.getRoute(
      data.destinationId,
      data.criteria,
    );
    const fPrice = getFPrice();
    const reachable = route.reachable;
    const routeMetricCost = reachable ? route.cost : 0;
    const maxHopsOk = reachable && data.maxHops >= route.hops;
    const amount =
      reachable && maxHopsOk
        ? computeAmount({
            height: data.height,
            width: data.width,
            depth: data.depth,
            routeMetricCost,
            fPrice,
          })
        : 0;

    return {
      destinationId: data.destinationId,
      criteria: data.criteria,
      routeMetricCost,
      hops: route.hops,
      nextHop: route.nextHop,
      path: route.path,
      fPrice,
      amount,
      reachable,
      maxHopsOk,
    };
  }

  // RF01
  async createShipment(ownerSubject: string, input: CreateShipmentRequest) {
    const parsed = CreateShipmentRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Datos de envío inválidos');
    }
    const data = parsed.data;
    const quote = await this.quote(data);

    if (!quote.reachable) {
      throw new BadRequestException(
        'El destino no es alcanzable desde esta ciudad.',
      );
    }
    if (!quote.maxHopsOk) {
      throw new BadRequestException(
        `maxHops (${data.maxHops}) es insuficiente para la ruta óptima (${quote.hops} saltos).`,
      );
    }

    const packageId = randomUUID();
    const shipment = await this.prisma.userShipment.create({
      data: {
        ownerSubject,
        packageId,
        originId: getOwnCityId(),
        destinationId: data.destinationId,
        height: data.height,
        width: data.width,
        depth: data.depth,
        criteria: data.criteria,
        maxHops: data.maxHops,
        deliveryStrategy: data.deliveryStrategy ?? 'random',
        priorityClass: data.priorityClass ?? 'medium',
        deliverNotBefore: data.deliverNotBefore
          ? new Date(data.deliverNotBefore)
          : null,
        metaContent: data.metaContent ?? null,
        routeMetricCost: BigInt(Math.round(quote.routeMetricCost)),
        fPrice: quote.fPrice,
        amount: quote.amount,
        hops: quote.hops,
        nextHop: quote.nextHop,
        routePath: quote.path as unknown as Prisma.InputJsonValue,
        status: 'pending-payment',
      },
    });

    return {
      shipmentId: shipment.id,
      packageId,
      amount: shipment.amount,
      quote,
    };
  }

  // RF05
  async listShipments(
    user: AuthUser,
    page = 1,
    limit = 25,
  ): Promise<{
    data: unknown[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const where = user.isAdmin ? {} : { ownerSubject: user.sub };
    const skip = (page - 1) * limit;
    const [shipments, total] = await Promise.all([
      this.prisma.userShipment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userShipment.count({ where }),
    ]);

    const ids = shipments.map((s) => s.id);
    const payments = await this.prisma.payment.findMany({
      where: { shipmentId: { in: ids } },
      orderBy: { createdAt: 'desc' },
    });
    const paymentByShipment = new Map<string, (typeof payments)[number]>();
    for (const p of payments) {
      if (!paymentByShipment.has(p.shipmentId)) {
        paymentByShipment.set(p.shipmentId, p);
      }
    }

    const data = shipments.map((s) =>
      this.toView(s, paymentByShipment.get(s.id)),
    );
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getShipment(user: AuthUser, id: string) {
    const shipment = await this.prisma.userShipment.findUnique({
      where: { id },
    });
    if (!shipment) {
      throw new NotFoundException('Envío no encontrado');
    }
    if (!user.isAdmin && shipment.ownerSubject !== user.sub) {
      throw new ForbiddenException('No puedes ver este envío.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { shipmentId: id },
      orderBy: { createdAt: 'desc' },
    });
    return this.toView(shipment, payment ?? undefined);
  }

  private toView(
    s: {
      id: string;
      packageId: string;
      destinationId: string;
      originId: string;
      criteria: string;
      amount: number;
      hops: number;
      nextHop: string | null;
      routeMetricCost: bigint;
      status: string;
      createdAt: Date;
      routePath: unknown;
    },
    payment?: {
      id: string;
      status: string;
      amount: number;
      authorizationCode: string | null;
      transactionDate: Date | null;
      reason: string | null;
    },
  ) {
    return {
      id: s.id,
      packageId: s.packageId,
      originId: s.originId,
      destinationId: s.destinationId,
      criteria: s.criteria,
      amount: s.amount,
      hops: s.hops,
      nextHop: s.nextHop,
      routeMetricCost: Number(s.routeMetricCost),
      routePath: s.routePath,
      status: s.status,
      createdAt: s.createdAt,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            authorizationCode: payment.authorizationCode,
            transactionDate: payment.transactionDate,
            reason: payment.reason,
          }
        : null,
    };
  }
}
