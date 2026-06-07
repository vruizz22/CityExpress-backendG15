import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Payment, UserShipment } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { AuthUser } from '@/auth/auth-user.interface';
import { PackageBody } from '@dto/package.dto';
import {
  CommitPaymentRequest,
  CommitPaymentRequestSchema,
  InitPaymentRequest,
  InitPaymentRequestSchema,
} from '@dto/payment.dto';
import { PaymentStatusData } from '@/messaging/message.types';
import { WebpayService } from './webpay.service';
import { PaymentAuditService } from './payment-audit.service';
import {
  INITIAL_SHIPMENT_SERVICE,
  InitialShipmentService,
} from '@/shipments/initial-shipment.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webpay: WebpayService,
    private readonly audit: PaymentAuditService,
    @Inject(INITIAL_SHIPMENT_SERVICE)
    private readonly initialShipment: InitialShipmentService,
  ) {}

  // RF03
  async initPayment(user: AuthUser, input: InitPaymentRequest) {
    const parsed = InitPaymentRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Datos de pago inválidos');
    }
    const shipment = await this.loadOwnedShipment(user, parsed.data.shipmentId);

    if (shipment.status === 'paid' || shipment.status === 'sent') {
      throw new ConflictException('El envío ya fue pagado.');
    }

    const existing = await this.prisma.payment.findFirst({
      where: { shipmentId: shipment.id, status: 'TRYING' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.webpayToken && existing.redirectUrl) {
      return {
        paymentId: existing.id,
        token: existing.webpayToken,
        url: existing.redirectUrl,
      };
    }

    const buyOrder = randomUUID().replace(/-/g, '').slice(0, 24);
    const sessionId = shipment.id;
    const returnUrl =
      parsed.data.returnUrl ??
      process.env.WEBPAY_RETURN_URL ??
      'http://localhost:5173/payment/callback';

    const payment = await this.prisma.payment.create({
      data: {
        id: randomUUID(),
        shipmentId: shipment.id,
        ownerSubject: shipment.ownerSubject,
        buyOrder,
        sessionId,
        amount: shipment.amount,
        status: 'TRYING',
      },
    });

    const created = await this.webpay.create(
      buyOrder,
      sessionId,
      shipment.amount,
      returnUrl,
    );

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { webpayToken: created.token, redirectUrl: created.url },
    });

    await this.audit.report(
      shipment.packageId,
      created.token,
      this.buildAuditData('TRYING', payment.id, shipment),
    );

    return { paymentId: payment.id, token: created.token, url: created.url };
  }

  // RF03
  async commitPayment(user: AuthUser, input: CommitPaymentRequest) {
    const parsed = CommitPaymentRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Datos de confirmación inválidos');
    }
    const successToken = parsed.data.token_ws ?? parsed.data.ws_token;
    const abortToken = parsed.data.TBK_TOKEN;
    const token = successToken ?? abortToken;

    if (!token) {
      return {
        paymentId: null,
        shipmentId: null,
        status: 'FAILED' as const,
        amount: null,
        currency: 'CLP',
        authorizationCode: null,
        transactionDate: null,
        reason: 'ABORTED',
        message: 'Transacción anulada por el usuario.',
      };
    }
    const aborted = !successToken && !!abortToken;

    const payment = await this.prisma.payment.findUnique({
      where: { webpayToken: token },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado para el token.');
    }
    if (!user.isAdmin && payment.ownerSubject !== user.sub) {
      throw new ForbiddenException('No puedes confirmar este pago.');
    }

    if (payment.status !== 'TRYING') {
      return this.resultOf(payment);
    }

    const shipment = await this.prisma.userShipment.findUnique({
      where: { id: payment.shipmentId },
    });
    if (!shipment) {
      throw new NotFoundException('Envío asociado no encontrado.');
    }

    if (aborted) {
      return this.finalize(payment, shipment, 'FAILED', {
        reason: 'ABORTED',
      });
    }

    let success = false;
    let authorizationCode: string | undefined;
    let transactionDate: string | undefined;
    let reason: string | undefined;
    let responseRaw: Prisma.InputJsonValue | undefined;
    try {
      const res = await this.webpay.commit(token);
      responseRaw = res as unknown as Prisma.InputJsonValue;
      success = res.response_code === 0 && res.status === 'AUTHORIZED';
      authorizationCode = res.authorization_code;
      transactionDate = res.transaction_date;
      if (!success) reason = 'REJECTED';
    } catch (err) {
      this.logger.error('Error al confirmar con Webpay', err as Error);
      success = false;
      reason = 'ERROR';
    }

    return this.finalize(payment, shipment, success ? 'SUCCESS' : 'FAILED', {
      authorizationCode,
      transactionDate,
      reason,
      responseRaw,
    });
  }

  async getPaymentStatus(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }
    if (!user.isAdmin && payment.ownerSubject !== user.sub) {
      throw new ForbiddenException('No puedes ver este pago.');
    }
    return this.resultOf(payment);
  }

  private async finalize(
    payment: Payment,
    shipment: UserShipment,
    status: 'SUCCESS' | 'FAILED',
    extra: {
      authorizationCode?: string;
      transactionDate?: string;
      reason?: string;
      responseRaw?: Prisma.InputJsonValue;
    },
  ) {
    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'TRYING' },
      data: {
        status,
        authorizationCode: extra.authorizationCode ?? null,
        transactionDate: extra.transactionDate
          ? new Date(extra.transactionDate)
          : null,
        reason: extra.reason ?? null,
        responseRaw: extra.responseRaw ?? Prisma.JsonNull,
      },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.payment.findUnique({
        where: { id: payment.id },
      });
      return this.resultOf(current ?? payment);
    }

    if (status === 'SUCCESS') {
      await this.prisma.userShipment.updateMany({
        where: { id: shipment.id, status: 'pending-payment' },
        data: { status: 'paid' },
      });
      await this.triggerInitialShipment(shipment);
    } else {
      await this.prisma.userShipment.updateMany({
        where: { id: shipment.id, status: 'pending-payment' },
        data: { status: 'failed' },
      });
    }

    await this.audit.report(
      shipment.packageId,
      payment.webpayToken ?? payment.buyOrder,
      this.buildAuditData(status, payment.id, shipment, extra),
    );

    const updated = await this.prisma.payment.findUnique({
      where: { id: payment.id },
    });
    return this.resultOf(updated ?? payment);
  }

  // RF04
  private async triggerInitialShipment(shipment: UserShipment) {
    const packageBody: PackageBody = {
      id: shipment.packageId,
      deliveryStrategy: shipment.deliveryStrategy,
      maxHops: shipment.maxHops,
      createdAt: new Date().toISOString(),
      deliverNotBefore: shipment.deliverNotBefore
        ? shipment.deliverNotBefore.toISOString()
        : null,
      originId: shipment.originId,
      destinationId: shipment.destinationId,
      metaContent: shipment.metaContent,
      isMetaEncrypted: false,
      constraints: { criteria: shipment.criteria },
      priorityClass: shipment.priorityClass,
      payment: shipment.amount,
    };
    try {
      await this.initialShipment.send(packageBody);
      await this.prisma.userShipment.updateMany({
        where: { id: shipment.id, status: 'paid' },
        data: { status: 'sent' },
      });
    } catch (err) {
      this.logger.error('Fallo el envío inicial tras el pago', err as Error);
      await this.prisma.userShipment.updateMany({
        where: { id: shipment.id, status: 'paid' },
        data: { status: 'pending-routing' },
      });
    }
  }

  private buildAuditData(
    status: PaymentStatusData['status'],
    paymentId: string,
    shipment: UserShipment,
    extra?: {
      authorizationCode?: string;
      transactionDate?: string;
      reason?: string;
    },
  ): PaymentStatusData {
    return {
      status,
      paymentId,
      amount: shipment.amount,
      currency: 'CLP',
      destinationId: shipment.destinationId,
      criteria: shipment.criteria,
      routeMetricCost: Number(shipment.routeMetricCost),
      maxHops: shipment.maxHops,
      ...(extra?.authorizationCode
        ? { authorizationCode: extra.authorizationCode }
        : {}),
      ...(extra?.transactionDate
        ? { transactionDate: extra.transactionDate }
        : {}),
      ...(extra?.reason ? { reason: extra.reason } : {}),
    };
  }

  private async loadOwnedShipment(
    user: AuthUser,
    shipmentId: string,
  ): Promise<UserShipment> {
    const shipment = await this.prisma.userShipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) {
      throw new NotFoundException('Envío no encontrado');
    }
    if (!user.isAdmin && shipment.ownerSubject !== user.sub) {
      throw new ForbiddenException('No puedes pagar este envío.');
    }
    return shipment;
  }

  private resultOf(payment: Payment) {
    return {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      authorizationCode: payment.authorizationCode,
      transactionDate: payment.transactionDate,
      reason: payment.reason,
      message: this.messageFor(payment.status, payment.reason),
    };
  }

  private messageFor(status: string, reason: string | null): string {
    if (status === 'SUCCESS') return 'Transacción aceptada.';
    if (status === 'FAILED') {
      return reason === 'ABORTED'
        ? 'Transacción anulada por el usuario.'
        : 'Transacción rechazada.';
    }
    return 'Pago en proceso.';
  }
}
