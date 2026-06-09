const amqp = require('amqplib');
const axios = require('axios');

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const RABBITMQ_QUEUE = process.env.RABBITMQ_QUEUE;
const MASTER_API_URL = process.env.MASTER_API_URL || 'http://master:3000';

async function start() {
  console.log(`Conectando a RabbitMQ...`);
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // En E2 el master (NestJS) consume el broker directamente (AMQP) y maneja
    // todos los tipos: package-transit, distance-table, cost-update, etc. Si el
    // connector tambien consume la misma cola, se reparte (round-robin) y ACKea
    // los tipos que no maneja -> se traga la tabla de distancias y el master no
    // la recibe. Por eso el connector queda deshabilitado salvo CONNECTOR_ENABLED=true.
    if (process.env.CONNECTOR_ENABLED !== 'true') {
      console.log(
        '[*] Connector deshabilitado (el master consume el broker en E2). ' +
          'Set CONNECTOR_ENABLED=true para reactivarlo.',
      );
      return; // mantiene la conexion abierta sin consumir
    }

    // Asertar la cola por seguridad
    // await channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
    console.log(`[*] Esperando eventos en la cola ${RABBITMQ_QUEUE}...`);

    channel.consume(RABBITMQ_QUEUE, async (msg) => {
      if (msg !== null) {
        try {
          const content = msg.content.toString();
          const data = JSON.parse(content);

          if (data.type === 'package-received') {
            const id = data.idpk || 'N/A';
            console.log(`[x] Evento ${data.type} detectado. IDPK: ${id}`);

            // Adaptamos el payload de RabbitMQ (body) al DTO de NestJS (packageBody)
            const payload = { ...data };
            if (payload.body && !payload.packageBody) {
              payload.packageBody = payload.body;
              delete payload.body;
            }

            // Enviar POST a la API MASTER
            await axios.post(`${MASTER_API_URL}/packages`, payload);
            console.log(`[V] POST exitoso a ${MASTER_API_URL}/packages`);
          } else {
            console.log(`[!] Tipo de mensaje ignorado: ${data.type}`);
          }

          // Ack para avisar a rabbitmq que se procesó bien
          channel.ack(msg);
        } catch (err) {
          console.error('[!] Error guardando el mensaje en el Master API:', err.message);
          channel.ack(msg);
        }
      }
    });
  } catch (error) {
    console.error('Error iniciando consumidor, reintentando en 5s', error.message);
    setTimeout(start, 5000);
  }
}

start();
