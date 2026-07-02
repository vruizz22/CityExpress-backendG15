import { SubscriptionEngineService } from './subscription-engine.service';
import { SubscriptionsService, TickResult } from './subscriptions.service';
import { PrismaService } from '@/prisma.service';
import { EventsService } from '@/events/events.service';
import { InitialShipmentService } from '@/shipments/initial-shipment.interface';

const sub = {
  id: 'sub-1',
  originId: 'HGW',
  destinationId: 'COR',
  deliveryStrategy: 'random',
  maxHops: 5,
  criteria: 'distance',
  insured: false,
  metaContent: null,
  priorityClass: 'medium',
  pricePerShipment: 10000,
};

function makeEngine(opts?: {
  tickResult?: TickResult;
  sendImpl?: () => Promise<void>;
}) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const prisma = {
    subscription: { findUnique: jest.fn().mockResolvedValue(sub) },
    subscriptionShipment: {
      update: jest.fn(
        (args: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(args);
          return Promise.resolve(args.data);
        },
      ),
    },
  };
  const subscriptions = {
    processTick: jest.fn().mockResolvedValue(
      opts?.tickResult ?? {
        status: 'triggered',
        idempotencyKey: 'sub-1:1',
        shipment: { id: 'ship-1' },
      },
    ),
  };
  const events = { publish: jest.fn() };
  const initialShipment = {
    send: jest.fn(opts?.sendImpl ?? (() => Promise.resolve())),
  };
  const engine = new SubscriptionEngineService(
    subscriptions as unknown as SubscriptionsService,
    prisma as unknown as PrismaService,
    events as unknown as EventsService,
    initialShipment as unknown as InitialShipmentService,
  );
  return { engine, updates, subscriptions, events, initialShipment };
}

describe('SubscriptionEngineService.runTick (RF01)', () => {
  it('despacha el paquete al broker y marca el envío como sent', async () => {
    const { engine, updates, events, initialShipment } = makeEngine();

    const res = await engine.runTick('sub-1', 1);

    expect(res.status).toBe('triggered');
    expect(initialShipment.send).toHaveBeenCalledTimes(1);
    expect(updates[0].data).toMatchObject({ status: 'sent' });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'package-created' }),
    );
  });

  it('no despacha si el tick no terminó en triggered (sin budget / duplicado)', async () => {
    const { engine, initialShipment } = makeEngine({
      tickResult: { status: 'skipped-no-budget', idempotencyKey: 'sub-1:1' },
    });

    const res = await engine.runTick('sub-1', 1);

    expect(res.status).toBe('skipped-no-budget');
    expect(initialShipment.send).not.toHaveBeenCalled();
  });

  it('si el despacho falla, marca el envío como failed con el motivo', async () => {
    const { engine, updates } = makeEngine({
      sendImpl: () => Promise.reject(new Error('sin ruta')),
    });

    await engine.runTick('sub-1', 1);

    expect(updates[0].data).toMatchObject({
      status: 'failed',
      reason: 'sin ruta',
    });
  });
});
