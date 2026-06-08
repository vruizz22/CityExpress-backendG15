import { Worker, Job } from 'bullmq';
import { computeOptimalRoutes, Graph, RoutingTables } from './dijkstra';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
};

interface JobPayload {
  sourceNode: string;
  graph: Graph;
}

// RNF06: el cálculo "worker" debe correr en una Lambda (Serverless).
// - Si WORKER_LAMBDA_NAME está seteado -> el worker BullMQ invoca esa Lambda.
// - Si no -> calcula localmente con dijkstra.ts (útil para dev/local sin AWS).
const lambdaName = process.env.WORKER_LAMBDA_NAME;
const lambdaClient = lambdaName
  ? new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' })
  : null;

async function computeViaLambda(payload: JobPayload): Promise<RoutingTables> {
  const res = await lambdaClient!.send(
    new InvokeCommand({
      FunctionName: lambdaName!,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  const raw = res.Payload ? Buffer.from(res.Payload).toString() : '';
  if (res.FunctionError) {
    throw new Error(`Lambda ${lambdaName} falló (${res.FunctionError}): ${raw}`);
  }
  return JSON.parse(raw) as RoutingTables;
}

const worker = new Worker(
  'routing-jobs',
  async (job: Job<JobPayload>) => {
    const mode = lambdaClient ? 'lambda' : 'local';
    console.log(
      `Procesando Job ${job.id} - Origen: ${job.data.sourceNode} (modo: ${mode})`,
    );

    const startTime = Date.now();

    const routingTables: RoutingTables = lambdaClient
      ? await computeViaLambda(job.data)
      : computeOptimalRoutes(job.data.graph, job.data.sourceNode);

    console.log(
      `Job ${job.id} completado en ${Date.now() - startTime}ms (modo: ${mode})`,
    );
    // BullMQ guarda esto como el 'returnvalue' del job (persistido en Redis).
    return routingTables;
  },
  { connection },
);

worker.on('ready', () =>
  console.log('Worker de rutas iniciado y esperando trabajos...'),
);
worker.on('failed', (job, err) =>
  console.log(`Job ${job?.id} falló con error: ${err.message}`),
);
