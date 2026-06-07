import { AmqpMessageBrokerService } from '@/messaging/amqp-message-broker.service';
import { AckMessage } from '@/messaging/message.types';

const makeMsg = (content: string) => ({
  content: Buffer.from(content),
  fields: {},
  properties: {},
});

const baseAck: AckMessage = {
  idpk: 'idpk-1',
  msgId: 'msg-1',
  type: 'ack',
  timestamp: '2026-05-03T00:00:00.000Z',
};

function mockChannel() {
  return {
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

type ServiceInternals = {
  logger: { warn: jest.Mock; error: jest.Mock };
  channel: unknown;
  pendingMessages: Array<{ routingKey: string; content: Buffer }>;
  onConnectCallbacks: Array<() => void>;
  flushPendingMessages: () => void;
};

function internals(service: AmqpMessageBrokerService): ServiceInternals {
  return service as unknown as ServiceInternals;
}

describe('AmqpMessageBrokerService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RABBITMQ_URL =
      'amqps://city.tk3:secret@broker.test:5671/fulfillment';
    process.env.RABBITMQ_QUEUE = 'city.tk3.q';
    process.env.RABBITMQ_EXCHANGE = 'fulfillment.x';
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  describe('send()', () => {
    it('queues the message when channel is not ready', () => {
      const service = new AmqpMessageBrokerService();
      jest
        .spyOn(internals(service).logger, 'warn')
        .mockImplementation(() => {});

      void service.send('city.central', baseAck);

      expect(internals(service).pendingMessages).toHaveLength(1);
      expect(internals(service).pendingMessages[0].routingKey).toBe(
        'city.central',
      );
    });

    it('publishes immediately when channel is available', () => {
      const service = new AmqpMessageBrokerService();
      const ch = mockChannel();
      internals(service).channel = ch;

      void service.send('city.HGW', baseAck);

      expect(ch.publish).toHaveBeenCalledWith(
        'fulfillment.x',
        'city.HGW',
        expect.any(Buffer),
        { persistent: true },
      );
    });
  });

  describe('startConsuming() via subscribe()', () => {
    it('acks message after successful handler', async () => {
      const ch = mockChannel();
      let capturedCb: ((msg: unknown) => void) | null = null;
      ch.consume = jest
        .fn()
        .mockImplementation((_q: string, cb: (msg: unknown) => void) => {
          capturedCb = cb;
          return Promise.resolve();
        });

      const service = new AmqpMessageBrokerService();
      internals(service).channel = ch;

      const handler = jest.fn().mockResolvedValue(undefined);
      await service.subscribe('city.tk3', handler);

      const msg = makeMsg(JSON.stringify(baseAck));
      capturedCb!(msg);
      await Promise.resolve();
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(baseAck);
      expect(ch.ack).toHaveBeenCalledWith(msg);
      expect(ch.nack).not.toHaveBeenCalled();
    });

    it('nacks with requeue when handler throws', async () => {
      const ch = mockChannel();
      let capturedCb: ((msg: unknown) => void) | null = null;
      ch.consume = jest
        .fn()
        .mockImplementation((_q: string, cb: (msg: unknown) => void) => {
          capturedCb = cb;
          return Promise.resolve();
        });

      const service = new AmqpMessageBrokerService();
      internals(service).channel = ch;
      jest
        .spyOn(internals(service).logger, 'error')
        .mockImplementation(() => {});

      await service.subscribe(
        'city.tk3',
        jest.fn().mockRejectedValue(new Error('db error')),
      );

      const msg = makeMsg(JSON.stringify(baseAck));
      capturedCb!(msg);
      await Promise.resolve();
      await Promise.resolve();

      expect(ch.nack).toHaveBeenCalledWith(msg, false, true);
      expect(ch.ack).not.toHaveBeenCalled();
    });

    it('nacks without requeue on malformed JSON', async () => {
      const ch = mockChannel();
      let capturedCb: ((msg: unknown) => void) | null = null;
      ch.consume = jest
        .fn()
        .mockImplementation((_q: string, cb: (msg: unknown) => void) => {
          capturedCb = cb;
          return Promise.resolve();
        });

      const service = new AmqpMessageBrokerService();
      internals(service).channel = ch;
      jest
        .spyOn(internals(service).logger, 'error')
        .mockImplementation(() => {});

      const handler = jest.fn();
      await service.subscribe('city.tk3', handler);

      capturedCb!(makeMsg('not-json{{{'));

      expect(handler).not.toHaveBeenCalled();
      expect(ch.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });
  });

  describe('onConnect()', () => {
    it('fires registered callbacks when called', () => {
      const service = new AmqpMessageBrokerService();
      const cb = jest.fn();
      service.onConnect(cb);

      internals(service).onConnectCallbacks.forEach((c) => c());

      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushPendingMessages()', () => {
    it('publishes buffered messages when channel becomes available', () => {
      const service = new AmqpMessageBrokerService();
      jest
        .spyOn(internals(service).logger, 'warn')
        .mockImplementation(() => {});
      void service.send('city.central', baseAck);
      expect(internals(service).pendingMessages).toHaveLength(1);

      const ch = mockChannel();
      internals(service).channel = ch;
      internals(service).flushPendingMessages();

      expect(ch.publish).toHaveBeenCalledWith(
        'fulfillment.x',
        'city.central',
        expect.any(Buffer),
        { persistent: true },
      );
      expect(internals(service).pendingMessages).toHaveLength(0);
    });
  });
});
