import { createBaseMessage } from '@/messaging/message.factory';
import { CITY_ID } from '@/config/city.config';

describe('createBaseMessage', () => {
  it('creates a message with distinct idpk and msgId', () => {
    const message = createBaseMessage('test-type');

    expect(message.type).toBe('test-type');
    expect(message.cityId).toBe(CITY_ID.toLowerCase());
    expect(message.idpk).not.toBe(message.msgId);
    expect(typeof message.idpk).toBe('string');
    expect(typeof message.msgId).toBe('string');
    const timestamp = new Date(message.timestamp);
    expect(Number.isNaN(timestamp.getTime())).toBe(false);
  });
});
