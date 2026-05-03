import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '@/routing/audit.service';
import { MESSAGE_BROKER } from '@/messaging/message-broker.interface';
import { AuditMessage } from '@/messaging/message.types';

describe('AuditService', () => {
  let service: AuditService;
  let broker: { send: jest.Mock };

  beforeEach(async () => {
    broker = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: MESSAGE_BROKER, useValue: broker }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('sends transit audits with nextCityId', async () => {
    await service.reportTransit('pkg-9', 'HGW');

    const [routingKey, payload] = broker.send.mock.calls[0] as [
      string,
      AuditMessage,
    ];

    expect(routingKey).toBe('city.central');
    expect(payload.type).toBe('transit');
    expect(payload.pkgId).toBe('pkg-9');
    expect(payload.data?.nextCityId).toBe('HGW');
  });

  it('sends expired audits without nextCityId', async () => {
    await service.reportExpired('pkg-10');

    const [routingKey, payload] = broker.send.mock.calls[0] as [
      string,
      AuditMessage,
    ];

    expect(routingKey).toBe('city.central');
    expect(payload.type).toBe('expired');
    expect(payload.pkgId).toBe('pkg-10');
    expect(payload.data).toBeUndefined();
  });
});
