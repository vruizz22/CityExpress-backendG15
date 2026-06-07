import { PaymentsService } from './payments.service';
import { AuthUser } from '@/auth/auth-user.interface';

interface PaymentRow {
  id: string;
  shipmentId: string;
  ownerSubject: string;
  buyOrder: string;
  webpayToken: string | null;
  redirectUrl: string | null;
  sessionId: string;
  amount: number;
  currency: string;
  status: string;
  authorizationCode: string | null;
  reason: string | null;
  transactionDate: Date | null;
  responseRaw: unknown;
  createdAt: Date;
}

interface ShipmentRow {
  id: string;
  ownerSubject: string;
  packageId: string;
  originId: string;
  destinationId: string;
  criteria: string;
  maxHops: number;
  deliveryStrategy: string;
  priorityClass: string;
  deliverNotBefore: Date | null;
  metaContent: string | null;
  routeMetricCost: bigint;
  amount: number;
  status: string;
}

type Where = Record<string, unknown>;
interface QueryArgs {
  where: Where;
  data?: Where;
}

const matches = (row: object, where: Where) =>
  Object.entries(where).every(
    ([k, v]) => (row as Record<string, unknown>)[k] === v,
  );

function createPrismaMock(payments: PaymentRow[], shipments: ShipmentRow[]) {
  return {
    payment: {
      findUnique: jest.fn(({ where }: QueryArgs) =>
        Promise.resolve(
          payments.find((p) =>
            where.id ? p.id === where.id : p.webpayToken === where.webpayToken,
          ) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }: QueryArgs) =>
        Promise.resolve(payments.find((p) => matches(p, where)) ?? null),
      ),
      create: jest.fn(({ data }: QueryArgs) => {
        const row = {
          webpayToken: null,
          redirectUrl: null,
          currency: 'CLP',
          authorizationCode: null,
          reason: null,
          transactionDate: null,
          responseRaw: null,
          createdAt: new Date(),
          ...(data as Record<string, unknown>),
        } as PaymentRow;
        payments.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: QueryArgs) => {
        const row = payments.find((p) => p.id === where.id) as PaymentRow;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: QueryArgs) => {
        const affected = payments.filter((p) => matches(p, where));
        affected.forEach((p) => Object.assign(p, data));
        return Promise.resolve({ count: affected.length });
      }),
    },
    userShipment: {
      findUnique: jest.fn(({ where }: QueryArgs) =>
        Promise.resolve(shipments.find((s) => s.id === where.id) ?? null),
      ),
      updateMany: jest.fn(({ where, data }: QueryArgs) => {
        const affected = shipments.filter((s) => matches(s, where));
        affected.forEach((s) => Object.assign(s, data));
        return Promise.resolve({ count: affected.length });
      }),
    },
  };
}

const user: AuthUser = {
  userId: 'u1',
  sub: 'auth0|u1',
  email: null,
  roles: [],
  isAdmin: false,
};

const baseShipment = (): ShipmentRow => ({
  id: 's1',
  ownerSubject: 'auth0|u1',
  packageId: 'pkg-1',
  originId: 'HGW',
  destinationId: 'COR',
  criteria: 'price',
  maxHops: 5,
  deliveryStrategy: 'random',
  priorityClass: 'medium',
  deliverNotBefore: null,
  metaContent: null,
  routeMetricCost: BigInt(12000),
  amount: 15000,
  status: 'pending-payment',
});

const tryingPayment = (): PaymentRow => ({
  id: 'p1',
  shipmentId: 's1',
  ownerSubject: 'auth0|u1',
  buyOrder: 'bo1',
  webpayToken: 'tok-1',
  redirectUrl: 'https://webpay/form',
  sessionId: 's1',
  amount: 15000,
  currency: 'CLP',
  status: 'TRYING',
  authorizationCode: null,
  reason: null,
  transactionDate: null,
  responseRaw: null,
  createdAt: new Date(),
});

describe('PaymentsService.commitPayment', () => {
  let webpay: { create: jest.Mock; commit: jest.Mock };
  let audit: { report: jest.Mock };
  let initialShipment: { send: jest.Mock };

  beforeEach(() => {
    webpay = { create: jest.fn(), commit: jest.fn() };
    audit = { report: jest.fn().mockResolvedValue(undefined) };
    initialShipment = { send: jest.fn().mockResolvedValue(undefined) };
  });

  const build = (payments: PaymentRow[], shipments: ShipmentRow[]) => {
    const prisma = createPrismaMock(payments, shipments);
    const service = new PaymentsService(
      prisma as never,
      webpay as never,
      audit as never,
      initialShipment as never,
    );
    return { service, prisma };
  };

  it('marca SUCCESS, gatilla el envío y audita una sola vez ante callbacks duplicados', async () => {
    const payments = [tryingPayment()];
    const shipments = [baseShipment()];
    webpay.commit.mockResolvedValue({
      response_code: 0,
      status: 'AUTHORIZED',
      authorization_code: 'auth-123',
      transaction_date: '2026-05-20T12:03:00Z',
    });
    const { service } = build(payments, shipments);

    const first = await service.commitPayment(user, { token_ws: 'tok-1' });
    expect(first.status).toBe('SUCCESS');
    expect(shipments[0].status).toBe('sent');
    expect(initialShipment.send).toHaveBeenCalledTimes(1);
    expect(audit.report).toHaveBeenCalledTimes(1);

    const second = await service.commitPayment(user, { token_ws: 'tok-1' });
    expect(second.status).toBe('SUCCESS');
    expect(webpay.commit).toHaveBeenCalledTimes(1);
    expect(initialShipment.send).toHaveBeenCalledTimes(1);
    expect(audit.report).toHaveBeenCalledTimes(1);
  });

  it('marca FAILED/REJECTED cuando Webpay rechaza y no gatilla envío', async () => {
    const payments = [tryingPayment()];
    const shipments = [baseShipment()];
    webpay.commit.mockResolvedValue({ response_code: -1, status: 'FAILED' });
    const { service } = build(payments, shipments);

    const res = await service.commitPayment(user, { token_ws: 'tok-1' });
    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('REJECTED');
    expect(initialShipment.send).not.toHaveBeenCalled();
    expect(shipments[0].status).toBe('failed');
  });

  it('marca FAILED/ABORTED ante TBK_TOKEN sin llamar a Webpay', async () => {
    const payments = [tryingPayment()];
    const shipments = [baseShipment()];
    const { service } = build(payments, shipments);

    const res = await service.commitPayment(user, { TBK_TOKEN: 'tok-1' });
    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('ABORTED');
    expect(webpay.commit).not.toHaveBeenCalled();
    expect(initialShipment.send).not.toHaveBeenCalled();
  });

  it('acepta el alias ws_token (estilo ayudantía)', async () => {
    const payments = [tryingPayment()];
    const shipments = [baseShipment()];
    webpay.commit.mockResolvedValue({
      response_code: 0,
      status: 'AUTHORIZED',
      authorization_code: 'auth-123',
      transaction_date: '2026-05-20T12:03:00Z',
    });
    const { service } = build(payments, shipments);

    const res = await service.commitPayment(user, { ws_token: 'tok-1' });
    expect(res.status).toBe('SUCCESS');
    expect(webpay.commit).toHaveBeenCalledWith('tok-1');
  });

  it('responde anulada (sin error) cuando no llega ningún token', async () => {
    const { service } = build([tryingPayment()], [baseShipment()]);
    const res = await service.commitPayment(user, {});
    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('ABORTED');
    expect(webpay.commit).not.toHaveBeenCalled();
  });
});
