import { BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ShipmentsService } from '@/shipments/shipments.service';
import { PrismaService } from '@/prisma.service';
import { priceWithSurcharges } from '@/payments/pricing';
import { QuoteResult } from '@dto/shipment.dto';

interface Store {
  subscriptions: Map<string, Record<string, unknown>>;
  shipments: Array<Record<string, unknown>>;
  ledger: Array<Record<string, unknown>>;
}

function createPrismaMock(store: Store) {
  let seq = 0;
  const client = {
    subscription: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `sub-${++seq}`,
          budgetSpent: 0,
          sentCount: 0,
          status: 'active',
          sfnExecutionArn: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.subscriptions.set(row.id, row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(store.subscriptions.get(where.id) ?? null),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.subscriptions.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return Promise.resolve(row);
      },
      findMany: () => Promise.resolve([...store.subscriptions.values()]),
      count: () => Promise.resolve(store.subscriptions.size),
    },
    subscriptionShipment: {
      findUnique: ({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(
          store.shipments.find(
            (s) => s.idempotencyKey === where.idempotencyKey,
          ) ?? null,
        ),
      create: ({ data }: { data: Record<string, unknown> }) => {
        if (
          store.shipments.some((s) => s.idempotencyKey === data.idempotencyKey)
        ) {
          throw new Error('unique violation');
        }
        const row = { id: `ship-${++seq}`, createdAt: new Date(), ...data };
        store.shipments.push(row);
        return Promise.resolve(row);
      },
      findMany: () => Promise.resolve([...store.shipments]),
    },
    budgetLedgerEntry: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `led-${++seq}`, createdAt: new Date(), ...data };
        store.ledger.push(row);
        return Promise.resolve(row);
      },
      findMany: () => Promise.resolve([...store.ledger]),
    },
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(client),
  };
  return client;
}

const reachableQuote: QuoteResult = {
  destinationId: 'COR',
  criteria: 'distance',
  routeMetricCost: 1000,
  hops: 2,
  nextHop: 'TAL',
  path: ['HGW', 'TAL', 'COR'],
  fPrice: 1,
  amount: 10000,
  reachable: true,
  maxHopsOk: true,
};

function makeService(opts?: { quote?: Partial<QuoteResult>; store?: Store }) {
  const store: Store = opts?.store ?? {
    subscriptions: new Map(),
    shipments: [],
    ledger: [],
  };
  const prisma = createPrismaMock(store);
  const shipments = {
    quote: jest.fn().mockResolvedValue({ ...reachableQuote, ...opts?.quote }),
  };
  const service = new SubscriptionsService(
    prisma as unknown as PrismaService,
    shipments as unknown as ShipmentsService,
  );
  return { service, store, shipments };
}

const baseInput = {
  destinationId: 'COR',
  height: 10,
  width: 10,
  depth: 10,
  criteria: 'distance' as const,
  maxHops: 5,
  priorityClass: 'medium' as const,
  insured: false,
  periodSeconds: 3600,
  amount: 5,
  budget: 100000,
};

describe('priceWithSurcharges (RF02/RF03)', () => {
  it('medium sin seguro no aplica recargos', () => {
    expect(
      priceWithSurcharges(10000, { priorityClass: 'medium', insured: false }),
    ).toBe(10000);
  });

  it('low aplica factor 0.5', () => {
    expect(
      priceWithSurcharges(10000, { priorityClass: 'low', insured: false }),
    ).toBe(5000);
  });

  it('high + seguro aplica 2.5 y prima del 5%', () => {
    expect(
      priceWithSurcharges(10000, { priorityClass: 'high', insured: true }),
    ).toBe(26250);
  });
});

describe('SubscriptionsService.create (validación RF01)', () => {
  beforeAll(() => {
    process.env.CITY_ID = 'HGW';
  });

  it('rechaza cantidad > 100', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { ...baseInput, amount: 101 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza periodicidad menor a 1 minuto', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { ...baseInput, periodSeconds: 59 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza periodicidad mayor a 2 días', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { ...baseInput, periodSeconds: 172801 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el destino no es alcanzable', async () => {
    const { service } = makeService({ quote: { reachable: false } });
    await expect(service.create('user-1', baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('crea la suscripción y registra la recarga inicial del budget', async () => {
    const { service, store } = makeService();
    const view = await service.create('user-1', {
      ...baseInput,
      priorityClass: 'high',
      insured: true,
    });

    expect(view.pricePerShipment).toBe(26250);
    expect(view.budgetRemaining).toBe(100000);
    expect(view.status).toBe('active');
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0]).toMatchObject({
      delta: 100000,
      balanceAfter: 100000,
      reason: 'initial',
    });
  });

  it('rechaza si el budget no alcanza ni para un envío', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { ...baseInput, budget: 9999 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SubscriptionsService.processTick (pago por envío + idempotencia RF01)', () => {
  function seedSubscription(store: Store, over?: Record<string, unknown>) {
    const row = {
      id: 'sub-1',
      ownerSubject: 'user-1',
      amount: 5,
      budget: 100000,
      pricePerShipment: 10000,
      budgetSpent: 0,
      sentCount: 0,
      status: 'active',
      ...over,
    };
    store.subscriptions.set('sub-1', row);
    return row;
  }

  it('descuenta el budget y registra el envío generado', async () => {
    const store: Store = {
      subscriptions: new Map(),
      shipments: [],
      ledger: [],
    };
    const { service } = makeService({ store });
    seedSubscription(store);

    const res = await service.processTick('sub-1', 1);

    expect(res.status).toBe('triggered');
    const sub = store.subscriptions.get('sub-1')!;
    expect(sub.budgetSpent).toBe(10000);
    expect(sub.sentCount).toBe(1);
    expect(store.shipments).toHaveLength(1);
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0]).toMatchObject({
      delta: -10000,
      balanceAfter: 90000,
    });
  });

  it('es idempotente: el mismo tick no cobra dos veces', async () => {
    const store: Store = {
      subscriptions: new Map(),
      shipments: [],
      ledger: [],
    };
    const { service } = makeService({ store });
    seedSubscription(store);

    const first = await service.processTick('sub-1', 1);
    const second = await service.processTick('sub-1', 1);

    expect(first.status).toBe('triggered');
    expect(second.status).toBe('duplicate');
    expect(store.subscriptions.get('sub-1')!.budgetSpent).toBe(10000);
    expect(store.shipments).toHaveLength(1);
    expect(store.ledger).toHaveLength(1);
  });

  it('marca exhausted cuando no queda budget para otro envío', async () => {
    const store: Store = {
      subscriptions: new Map(),
      shipments: [],
      ledger: [],
    };
    const { service } = makeService({ store });
    seedSubscription(store, { budget: 10000, budgetSpent: 5000 });

    const res = await service.processTick('sub-1', 1);

    expect(res.status).toBe('skipped-no-budget');
    expect(store.subscriptions.get('sub-1')!.status).toBe('exhausted');
    expect(store.subscriptions.get('sub-1')!.budgetSpent).toBe(5000);
  });

  it('marca completed al alcanzar la cantidad configurada', async () => {
    const store: Store = {
      subscriptions: new Map(),
      shipments: [],
      ledger: [],
    };
    const { service } = makeService({ store });
    seedSubscription(store, { amount: 1, sentCount: 0 });

    const res = await service.processTick('sub-1', 1);

    expect(res.status).toBe('triggered');
    expect(store.subscriptions.get('sub-1')!.status).toBe('completed');
  });
});
