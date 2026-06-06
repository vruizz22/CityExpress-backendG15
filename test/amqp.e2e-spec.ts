import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const request = require('supertest');
const amqp = require('amqplib');
import { AppModule } from '../src/app.module';

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'fulfillment.x';
const ROUTING_KEY = process.env.ROUTING_KEY || 'city.TK3';

describe('AMQP integration (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // ensure env for app module
    process.env.RABBITMQ_URL = RABBIT_URL;
    process.env.RABBITMQ_QUEUE = 'test.q';
    process.env.RABBITMQ_EXCHANGE = EXCHANGE;
    process.env.USE_AMQP = 'true';

    // Pre-create exchange and queue and bind so the broker service can attach
    const conn = await amqp.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
    await ch.assertQueue(process.env.RABBITMQ_QUEUE, { durable: true });
    await ch.bindQueue(process.env.RABBITMQ_QUEUE, EXCHANGE, ROUTING_KEY);
    await ch.close();
    await conn.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('processes cost-update and exposes routes', async () => {
    // publish test message
    const conn = await amqp.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });

    const msg = {
      idpk: 'itest',
      msgId: 'itest-1',
      type: 'cost-update',
      timestamp: new Date().toISOString(),
      data: {
        distances: {
          HGW: {
            destinationCode: 'HGW',
            destinationName: 'Hogwarts',
            distance: 100,
            transportCost: 10,
            enabled: true,
          },
        },
      },
    };

    ch.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(msg)), {
      persistent: true,
    });
    await ch.close();
    await conn.close();

    // poll GET /routes until we see HGW
    const server = app.getHttpServer();
    const maxAttempts = 10;
    let found = false;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await request(server).get('/routes');
      if (res.status === 200 && Array.isArray(res.body.data)) {
        const codes = res.body.data.map((r: any) => r.code);
        if (codes.includes('HGW')) {
          found = true;
          break;
        }
      }
      // wait 500ms
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(found).toBe(true);
  }, 20000);
});
