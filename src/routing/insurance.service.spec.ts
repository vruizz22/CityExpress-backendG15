import { InsuranceService } from '@/routing/insurance.service';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { PackageStatusMessage } from '@/messaging/message.types';
import { EventsService } from '@/events/events.service';
import { PrismaService } from '@/prisma.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageBody } from '@dto/package.dto';

const buildPackage = (overrides?: Partial<PackageBody>): PackageBody => ({
  id: 'pkg-1',
  deliveryStrategy: 'direct',
  maxHops: 0,
  createdAt: '2026-07-02T00:00:00.000Z',
  deliverNotBefore: null,
  originId: 'COR',
  destinationId: 'HGW',
  metaContent: { insured: true },
  isMetaEncrypted: false,
  constraints: { criteria: 'price' },
  priorityClass: 'medium',
  payment: 10000,
  ...overrides,
});

function makeService() {
  const broker: MessageBrokerService = {
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
  };
  const packageEvents = {
    claim: jest.fn().mockResolvedValue('created'),
  } as unknown as PackageEventsRepository;
  const prisma = {
    userShipment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionShipment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;
  const events = { publish: jest.fn() } as unknown as EventsService;
  const service = new InsuranceService(broker, packageEvents, prisma, events);
  return { broker, packageEvents, prisma, events, service };
}

describe('InsuranceService', () => {
  describe('handleUndeliverable', () => {
    it('no asegurado → no-op (sin claim ni mensajes)', async () => {
      const { broker, packageEvents, service } = makeService();

      await service.handleUndeliverable(
        buildPackage({ metaContent: null }),
        'max hops exceeded',
      );

      expect(packageEvents.claim).not.toHaveBeenCalled();
      expect(broker.send).not.toHaveBeenCalled();
    });

    it('asegurado con origen remoto → package-status expired a city.<origen>', async () => {
      const { broker, packageEvents, service } = makeService();
      const pkg = buildPackage({ originId: 'COR' });

      await service.handleUndeliverable(pkg, 'max hops exceeded');

      expect(packageEvents.claim).toHaveBeenCalledWith(
        'pkg-status',
        pkg,
        expect.any(String),
      );
      const [routingKey, message] = (broker.send as jest.Mock).mock
        .calls[0] as [string, PackageStatusMessage];
      expect(routingKey).toBe('city.cor');
      expect(message.type).toBe('package-status');
      expect(message.data).toEqual({
        pkgId: 'pkg-1',
        status: 'expired',
        reason: 'max hops exceeded',
      });
    });

    it('claim duplicado → no re-envía (anti-loop ante reentregas)', async () => {
      const { broker, packageEvents, service } = makeService();
      (packageEvents.claim as jest.Mock).mockResolvedValue('duplicate');

      await service.handleUndeliverable(buildPackage(), 'max hops exceeded');

      expect(broker.send).not.toHaveBeenCalled();
    });

    it('asegurado con origen local (nuestra ciudad) → cobra directo sin broker', async () => {
      const { broker, prisma, events, service } = makeService();
      // CITY_ID default en tests es TK3; sameCity es case-insensitive.
      const pkg = buildPackage({ originId: 'tk3' });

      await service.handleUndeliverable(pkg, 'max hops exceeded');

      expect(broker.send).not.toHaveBeenCalled();
      expect(prisma.userShipment.updateMany).toHaveBeenCalledWith({
        where: { packageId: 'pkg-1' },
        data: { status: 'expired-insured' },
      });
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'insurance-charged' }),
      );
    });
  });

  describe('chargeInsurance', () => {
    it('cobra una vez: marca envíos expired-insured y publica al feed', async () => {
      const { packageEvents, prisma, events, service } = makeService();

      await service.chargeInsurance('pkg-9', 'max hops exceeded');

      expect(packageEvents.claim).toHaveBeenCalledWith(
        'insurance',
        expect.objectContaining({ id: 'pkg-9' }),
        expect.any(String),
      );
      expect(prisma.userShipment.updateMany).toHaveBeenCalledWith({
        where: { packageId: 'pkg-9' },
        data: { status: 'expired-insured' },
      });
      expect(prisma.subscriptionShipment.updateMany).toHaveBeenCalledWith({
        where: { packageId: 'pkg-9' },
        data: { status: 'expired-insured', reason: 'max hops exceeded' },
      });
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'insurance-charged',
          packageId: 'pkg-9',
          reason: 'max hops exceeded',
        }),
      );
    });

    it('es idempotente: claim duplicado → sin updates ni evento', async () => {
      const { packageEvents, prisma, events, service } = makeService();
      (packageEvents.claim as jest.Mock).mockResolvedValue('duplicate');

      await service.chargeInsurance('pkg-9', 'max hops exceeded');

      expect(prisma.userShipment.updateMany).not.toHaveBeenCalled();
      expect(prisma.subscriptionShipment.updateMany).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
