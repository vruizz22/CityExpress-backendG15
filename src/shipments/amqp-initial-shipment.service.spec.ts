import { AmqpInitialShipmentService } from '@/shipments/amqp-initial-shipment.service';
import { MessageBrokerService } from '@/messaging/message-broker.interface';
import { DistanceTableService } from '@/routing/distance-table.service';
import { PackageEventsRepository } from '@/routing/package-events.repository';
import { PackageTransitMessage } from '@/messaging/message.types';
import { PackageBody } from '@dto/package.dto';

const buildPackage = (criteria = 'price'): PackageBody => ({
  id: 'pkg-1',
  deliveryStrategy: 'direct',
  maxHops: 5,
  createdAt: '2026-05-20T12:00:00.000Z',
  deliverNotBefore: null,
  originId: 'TK3',
  destinationId: 'HGW',
  metaContent: 'hi',
  isMetaEncrypted: false,
  constraints: { criteria },
  priorityClass: 'medium',
  payment: 15000,
});

function makeService() {
  const broker: MessageBrokerService = {
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
  };
  const distanceTable = {
    getNextHop: jest.fn().mockReturnValue('COR'),
  } as unknown as DistanceTableService;
  const packageEvents = {
    recordInitialSent: jest.fn().mockResolvedValue('created'),
  } as unknown as PackageEventsRepository;
  const service = new AmqpInitialShipmentService(
    broker,
    distanceTable,
    packageEvents,
  );
  return { broker, distanceTable, packageEvents, service };
}

describe('AmqpInitialShipmentService', () => {
  it('publishes a package-transit to the next hop using the package criteria', async () => {
    const { broker, distanceTable, service } = makeService();

    await service.send(buildPackage('price'));

    expect(distanceTable.getNextHop).toHaveBeenCalledWith('HGW', 'price');
    const [routingKey, message] = (broker.send as jest.Mock).mock.calls[0] as [
      string,
      PackageTransitMessage,
    ];
    expect(routingKey).toBe('city.COR');
    expect(message.type).toBe('package-transit');
    expect(message.packageBody.id).toBe('pkg-1');
  });

  it('is idempotent: a duplicate claim does not publish', async () => {
    const { broker, packageEvents, service } = makeService();
    (packageEvents.recordInitialSent as jest.Mock).mockResolvedValue(
      'duplicate',
    );

    await service.send(buildPackage('distance'));

    expect(broker.send).not.toHaveBeenCalled();
  });

  it('throws and does not claim when there is no next hop', async () => {
    const { broker, distanceTable, packageEvents, service } = makeService();
    (distanceTable.getNextHop as jest.Mock).mockReturnValue(null);

    await expect(service.send(buildPackage('price'))).rejects.toThrow();
    expect(packageEvents.recordInitialSent).not.toHaveBeenCalled();
    expect(broker.send).not.toHaveBeenCalled();
  });
});
