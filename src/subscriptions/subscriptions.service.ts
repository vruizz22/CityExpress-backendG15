import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { getOwnCityId } from '@config/city.config';
import { AuthUser } from '@/auth/auth-user.interface';
import { ShipmentsService } from '@/shipments/shipments.service';
import { dimensionsValid, priceWithSurcharges } from '@/payments/pricing';
import {
  CreateSubscriptionRequest,
  CreateSubscriptionSchema,
} from '@dto/subscription.dto';

type SubscriptionRow = Prisma.SubscriptionGetPayload<object>;
type SubscriptionShipmentRow = Prisma.SubscriptionShipmentGetPayload<object>;
type BudgetLedgerEntryRow = Prisma.BudgetLedgerEntryGetPayload<object>;

export type TickStatus =
  | 'triggered'
  | 'duplicate'
  | 'inactive'
  | 'completed'
  | 'skipped-no-budget';

export interface TickResult {
  status: TickStatus;
  idempotencyKey: string;
  shipment?: SubscriptionShipmentRow;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
  ) {}

  // RF01
  async create(ownerSubject: string, input: CreateSubscriptionRequest) {
    const parsed = CreateSubscriptionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Datos de suscripción inválidos',
        issues: parsed.error.issues,
      });
    }
    const data = parsed.data;

    if (!dimensionsValid(data.height, data.width, data.depth)) {
      throw new BadRequestException(
        'Dimensiones inválidas: h+w+d debe ser > 0 y <= 3000 cm.',
      );
    }

    const quote = await this.shipments.quote({
      destinationId: data.destinationId,
      height: data.height,
      width: data.width,
      depth: data.depth,
      criteria: data.criteria,
      maxHops: data.maxHops,
    });
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

    const pricePerShipment = priceWithSurcharges(quote.amount, {
      priorityClass: data.priorityClass,
      insured: data.insured,
    });
    if (pricePerShipment > data.budget) {
      throw new BadRequestException(
        `El budget (${data.budget}) no alcanza ni para un envío (precio por envío ${pricePerShipment}).`,
      );
    }

    const sub = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          ownerSubject,
          originId: getOwnCityId(),
          destinationId: data.destinationId,
          height: data.height,
          width: data.width,
          depth: data.depth,
          criteria: data.criteria,
          maxHops: data.maxHops,
          deliveryStrategy: data.deliveryStrategy ?? 'random',
          priorityClass: data.priorityClass,
          insured: data.insured,
          metaContent: data.metaContent ?? null,
          periodSeconds: data.periodSeconds,
          amount: data.amount,
          budget: data.budget,
          pricePerShipment,
          status: 'active',
        },
      });
      await tx.budgetLedgerEntry.create({
        data: {
          subscriptionId: created.id,
          delta: data.budget,
          balanceAfter: data.budget,
          reason: 'initial',
        },
      });
      return created;
    });

    this.logger.log(
      `Suscripción creada ${sub.id} (owner=${ownerSubject}, amount=${sub.amount}, budget=${sub.budget}, precio/envío=${pricePerShipment}).`,
    );
    return this.toView(sub);
  }

  // RF01
  async list(user: AuthUser, page = 1, limit = 25) {
    const where = user.isAdmin ? {} : { ownerSubject: user.sub };
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return {
      data: rows.map((s) => this.toView(s)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // RF01
  async get(user: AuthUser, id: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) {
      throw new NotFoundException('Suscripción no encontrada');
    }
    if (!user.isAdmin && sub.ownerSubject !== user.sub) {
      throw new ForbiddenException('No puedes ver esta suscripción.');
    }
    const [shipments, ledger] = await Promise.all([
      this.prisma.subscriptionShipment.findMany({
        where: { subscriptionId: id },
        orderBy: { tickNumber: 'asc' },
      }),
      this.prisma.budgetLedgerEntry.findMany({
        where: { subscriptionId: id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return this.toView(sub, shipments, ledger);
  }

  // RF01
  async processTick(
    subscriptionId: string,
    tickNumber: number,
  ): Promise<TickResult> {
    const idempotencyKey = `${subscriptionId}:${tickNumber}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.subscriptionShipment.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return { status: 'duplicate', idempotencyKey, shipment: existing };
        }

        const sub = await tx.subscription.findUnique({
          where: { id: subscriptionId },
        });
        if (!sub) {
          throw new NotFoundException('Suscripción no encontrada');
        }
        if (sub.status !== 'active') {
          return { status: 'inactive', idempotencyKey };
        }
        if (sub.sentCount >= sub.amount) {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'completed' },
          });
          return { status: 'completed', idempotencyKey };
        }

        const remaining = sub.budget - sub.budgetSpent;
        if (remaining < sub.pricePerShipment) {
          const ship = await tx.subscriptionShipment.create({
            data: {
              subscriptionId,
              idempotencyKey,
              tickNumber,
              cost: 0,
              status: 'skipped-no-budget',
              reason: `Budget insuficiente (resta ${remaining}, precio ${sub.pricePerShipment}).`,
            },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'exhausted' },
          });
          return {
            status: 'skipped-no-budget',
            idempotencyKey,
            shipment: ship,
          };
        }

        const cost = sub.pricePerShipment;
        const newSpent = sub.budgetSpent + cost;
        const newSent = sub.sentCount + 1;
        const ship = await tx.subscriptionShipment.create({
          data: {
            subscriptionId,
            idempotencyKey,
            tickNumber,
            cost,
            status: 'triggered',
          },
        });
        await tx.budgetLedgerEntry.create({
          data: {
            subscriptionId,
            delta: -cost,
            balanceAfter: sub.budget - newSpent,
            reason: 'shipment-debit',
            refId: idempotencyKey,
          },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            budgetSpent: newSpent,
            sentCount: newSent,
            status: newSent >= sub.amount ? 'completed' : 'active',
          },
        });
        return { status: 'triggered', idempotencyKey, shipment: ship };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const shipment = await this.prisma.subscriptionShipment.findUnique({
          where: { idempotencyKey },
        });
        return {
          status: 'duplicate',
          idempotencyKey,
          shipment: shipment ?? undefined,
        };
      }
      throw err;
    }
  }

  private toView(
    s: SubscriptionRow,
    shipments?: SubscriptionShipmentRow[],
    ledger?: BudgetLedgerEntryRow[],
  ) {
    return {
      id: s.id,
      ownerSubject: s.ownerSubject,
      originId: s.originId,
      destinationId: s.destinationId,
      height: s.height,
      width: s.width,
      depth: s.depth,
      criteria: s.criteria,
      maxHops: s.maxHops,
      deliveryStrategy: s.deliveryStrategy,
      priorityClass: s.priorityClass,
      insured: s.insured,
      metaContent: s.metaContent,
      periodSeconds: s.periodSeconds,
      amount: s.amount,
      budget: s.budget,
      pricePerShipment: s.pricePerShipment,
      budgetSpent: s.budgetSpent,
      budgetRemaining: s.budget - s.budgetSpent,
      sentCount: s.sentCount,
      remaining: s.amount - s.sentCount,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      shipments: shipments?.map((ss) => ({
        id: ss.id,
        idempotencyKey: ss.idempotencyKey,
        tickNumber: ss.tickNumber,
        packageId: ss.packageId,
        cost: ss.cost,
        status: ss.status,
        reason: ss.reason,
        createdAt: ss.createdAt,
      })),
      ledger: ledger?.map((l) => ({
        id: l.id,
        delta: l.delta,
        balanceAfter: l.balanceAfter,
        reason: l.reason,
        refId: l.refId,
        createdAt: l.createdAt,
      })),
    };
  }
}
