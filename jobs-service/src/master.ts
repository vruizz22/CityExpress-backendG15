// src/master.ts
import express from 'express';
import { Queue } from 'bullmq';
import { z } from 'zod';

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// Configuración de conexión a Redis
const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10)
};

// Instanciamos la cola de BullMQ
const routingQueue = new Queue('routing-jobs', { connection });

// Validación Zod para el Payload del Job
const routeEdgeSchema = z.object({
  code: z.string(),
  distance: z.number(),
  transportCost: z.number(),
  enabled: z.boolean()
});

const jobPayloadSchema = z.object({
  sourceNode: z.string().default('TK3'),
  // FIX 1: Especificamos z.string() explícitamente como el tipo de la llave
  graph: z.record(z.string(), z.array(routeEdgeSchema))
});

// Endpoint 1: Crear un trabajo
app.post('/job', async (req, res) => {
  // FIX 2: Usamos safeParse en lugar de try/catch para la validación
  const parsed = jobPayloadSchema.safeParse(req.body);
  
  if (!parsed.success) {
    // Si falla, parsed.error.issues contiene el detalle tipado correctamente
    return res.status(400).json({ error: 'Payload inválido', details: parsed.error.issues });
  }

  try {
    // Usamos parsed.data, que ya está validado y tipado
    const job = await routingQueue.add('calculate-routes', parsed.data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });

    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    console.error('[JobMaster] Fallo al encolar el trabajo en Redis:', error); 
    res.status(500).json({ error: 'Error interno al encolar el trabajo' });
  }
});

// Endpoint 2: Consultar estado de un trabajo
app.get('/job/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const job = await routingQueue.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job no encontrado' });
    }

    const state = await job.getState();
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    res.json({
      id: job.id,
      state,
      result: result || null,
      error: failedReason || null
    });
  } catch (error) {
    console.error('[JobMaster] Fallo al consultar el estado del trabajo:', error); 
    res.status(500).json({ error: 'Error al consultar el trabajo' });
  }
});

// Endpoint 3: Heartbeat
app.get('/heartbeat', (req, res) => {
  res.json({ status: true, service: 'Routing Job Master' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Job Master corriendo en el puerto ${PORT}`);
});