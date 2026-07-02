import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from '@aws-sdk/client-sfn';
import { z } from 'zod';

/**
 * Dispatcher Lambda (RF01, E3) — worker de cada envío de una suscripción.
 *
 * Lo dispara la cola SQS "tick queue" que alimenta la state machine de
 * suscripciones (`DispatchTick` usa `sqs:sendMessage.waitForTaskToken`, así que
 * cada mensaje trae el `taskToken` de la ejecución pausada).
 *
 * Por cada tick:
 *   1. llama al backend `POST /subscriptions/:id/tick { tickNumber }` (header x-tick-secret)
 *      (ese endpoint invoca `processTick`, que hace gate + cobro + idempotencia),
 *   2. devuelve el `TickResult` a la state machine con `SendTaskSuccess`
 *      (la state machine decide si sigue el loop o para según `status`),
 *   3. si algo falla, `SendTaskFailure` → el `Retry` de `DispatchTick` reintenta
 *      con un token nuevo (no re-encolamos el mensaje viejo).
 *
 * El contrato con el backend está en E3/contrato-trigger-andres.md.
 */

// Subconjunto del evento SQS que nos interesa (evita depender de @types/aws-lambda).
interface SQSRecord {
  messageId: string;
  body: string;
}
interface SQSEvent {
  Records: SQSRecord[];
}

const tickMessageSchema = z.object({
  subscriptionId: z.string().min(1),
  tickNumber: z.number().int().nonnegative(),
  taskToken: z.string().min(1),
});

const region = process.env.AWS_REGION || 'us-east-1';
const sfn = new SFNClient({ region });

// URL base del backend + secreto compartido del endpoint /tick (guard `x-tick-secret`).
const BACKEND_URL = process.env.BACKEND_URL ?? '';
const TICK_SECRET = process.env.SUBSCRIPTION_TICK_SECRET ?? '';
// Margen para que el fetch no cuelgue el TimeoutSeconds del Task state (60s).
const TICK_TIMEOUT_MS = Number.parseInt(process.env.TICK_TIMEOUT_MS ?? '15000', 10);

export const dispatch = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let msg: z.infer<typeof tickMessageSchema>;
    try {
      msg = tickMessageSchema.parse(JSON.parse(record.body));
    } catch (err) {
      // Sin taskToken válido no hay a quién avisar: log y seguimos.
      // (Si el mensaje es basura, la redrive policy de SQS lo manda a la DLQ.)
      console.error(`[dispatch] mensaje inválido (${record.messageId}):`, err);
      continue;
    }

    const { subscriptionId, tickNumber, taskToken } = msg;

    try {
      const tickResult = await callBackendTick(subscriptionId, tickNumber);
      await sfn.send(
        new SendTaskSuccessCommand({
          taskToken,
          output: JSON.stringify(tickResult),
        }),
      );
      console.log(
        `[dispatch] ${subscriptionId} tick ${tickNumber} → ${tickResult.status}`,
      );
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      console.error(
        `[dispatch] fallo ${subscriptionId} tick ${tickNumber}: ${cause}`,
      );
      // Devolvemos la falla a la state machine: su Retry/Catch decide qué hacer.
      await sfn.send(
        new SendTaskFailureCommand({
          taskToken,
          error: 'DispatchFailed',
          cause,
        }),
      );
    }
  }
};

async function callBackendTick(
  subscriptionId: string,
  tickNumber: number,
): Promise<{ status: string; [k: string]: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TICK_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BACKEND_URL}/subscriptions/${subscriptionId}/tick`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tick-secret': TICK_SECRET,
        },
        body: JSON.stringify({ tickNumber }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`backend respondió ${res.status}: ${text}`);
    }
    return (await res.json()) as { status: string };
  } finally {
    clearTimeout(timer);
  }
}
