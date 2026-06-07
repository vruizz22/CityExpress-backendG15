#!/usr/bin/env node
const amqp = require('amqplib');

async function run() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  const exchange = process.env.RABBITMQ_EXCHANGE || 'fulfillment.x';
  const routingKey = process.env.ROUTING_KEY || 'city.TK3';

  const msg = {
    idpk: 'test-idpk',
    msgId: 'test-msg',
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

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(exchange, 'topic', { durable: true });
  ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(msg)), {
    persistent: true,
  });
  console.log('Published cost-update to', exchange, routingKey);
  await ch.close();
  await conn.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
