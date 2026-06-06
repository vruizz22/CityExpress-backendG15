
import { Worker, Job } from 'bullmq';
import { computeOptimalRoutes, Graph } from './dijkstra';

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10)
};

interface JobPayload {
  sourceNode: string;
  graph: Graph;
}

const worker = new Worker('routing-jobs', async (job: Job<JobPayload>) => {
  console.log(`Procesando Job ${job.id} - Origen: ${job.data.sourceNode}`);
  
  const startTime = Date.now();
  
  try {
    const routingTables = computeOptimalRoutes(job.data.graph, job.data.sourceNode);
    
    const elapsedTime = Date.now() - startTime;
    console.log(`Job ${job.id} completado en ${elapsedTime}ms`);
    
    // Este return se guarda automáticamente en Redis como el 'returnvalue' del job
    return routingTables;
  } catch (error) {
    console.error(`Error procesando Job ${job.id}:`, error);
    throw error; // Al lanzar el error, BullMQ marca el job como 'failed' y aplica retries
  }
}, { connection });

worker.on('ready', () => console.log('Worker de rutas iniciado y esperando trabajos...'));
worker.on('failed', (job, err) => console.log(`Job ${job?.id} falló con error: ${err.message}`));