import { NoopMessageBrokerService } from '@/messaging/noop-message-broker.service';
import { AckMessage } from '@/messaging/message.types';

describe('NoopMessageBrokerService', () => {
  it('warns on send and subscribe without throwing', async () => {
    const service = new NoopMessageBrokerService();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const message: AckMessage = {
      idpk: 'idpk-1',
      msgId: 'msg-1',
      type: 'ack',
      timestamp: '2026-04-29T00:00:00.000Z',
    };

    await service.send('city.TK3', message);
    await service.subscribe('city.TK3', async () => {});

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
