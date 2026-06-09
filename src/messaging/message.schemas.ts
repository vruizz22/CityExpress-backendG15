import { z } from 'zod';
import { PackageBodySchema } from '@dto/package.dto';

// Gate de entrada para CUALQUIER mensaje. La central (y otras ciudades) NO
// siempre incluyen `idpk`/`msgId` en sus respuestas (ver docs/requirements.md
// §6.2: la tabla de distancias llega sin esos campos). Si los exigimos aquí, el
// envelope se rechaza y la tabla nunca se aplica → GET /routes devuelve todas
// las ciudades como `enabled: false`. Por eso son opcionales en el gate.
export const MessageEnvelopeSchema = z.object({
  idpk: z.string().min(1).optional(),
  msgId: z.string().min(1).optional(),
  type: z.string().min(1),
  cityId: z.string().min(1).optional(),
});

// Los tipos de mensaje que SÍ requieren idpk/msgId (package-transit, payment,
// ack) los re-exigen aquí. `timestamp` se mantiene laxo: la central no garantiza
// un ISO 8601 estricto.
export const BaseMessageSchema = MessageEnvelopeSchema.extend({
  idpk: z.string().min(1),
  msgId: z.string().min(1),
  timestamp: z.string().min(1),
});

// La central envía el paquete bajo el campo `body`; nuestro modelo y los tests
// usan `packageBody`. Normalizamos antes de validar para aceptar ambos.
export const PackageTransitMessageSchema = z.preprocess(
  (data: unknown) => {
    if (
      data &&
      typeof data === 'object' &&
      'body' in data &&
      !('packageBody' in data)
    ) {
      const { body, ...rest } = data as {
        body: unknown;
        [key: string]: unknown;
      };
      return { ...rest, packageBody: body };
    }
    return data;
  },
  BaseMessageSchema.extend({
    type: z.literal('package-transit'),
    packageBody: PackageBodySchema,
  }),
);

export const DistanceTableEntrySchema = z.object({
  destinationCode: z.string().min(1),
  destinationName: z.string().min(1),
  distance: z.number(),
  transportCost: z.number(),
  enabled: z.boolean(),
});

// RF06 — la tabla que envía la central llega SIN `idpk`/`msgId` (§6.2), así que
// aquí son opcionales (a diferencia de package-transit/payment/ack). Solo se usan
// para el ACK a un peer, donde caemos a '' si faltan.
export const DistanceTableMessageSchema = BaseMessageSchema.extend({
  idpk: z.string().min(1).optional(),
  msgId: z.string().min(1).optional(),
  type: z.enum(['distance-table', 'cost-update']),
  data: z.object({
    distances: z.record(z.string(), DistanceTableEntrySchema),
  }),
});

// RF06 — request de tabla de distancias que envían otras ciudades a nuestra cola.
export const DistanceTableRequestSchema = BaseMessageSchema.extend({
  type: z.literal('request'),
  source: z.string().min(1),
  data: z.object({
    ask: z.literal('distance-table'),
  }),
});

export const AckMessageSchema = BaseMessageSchema.extend({
  type: z.enum(['ack', 'nack']),
});

export const PaymentStatusMessageSchema = BaseMessageSchema.extend({
  type: z.literal('payment-status'),
  pkgId: z.string().min(1),
  payment_token: z.string().min(1),
  data: z.object({
    status: z.enum(['TRYING', 'SUCCESS', 'FAILED']),
    paymentId: z.string().min(1),
    amount: z.number(),
    currency: z.string().min(1),
    destinationId: z.string().min(1),
    criteria: z.string().min(1),
    routeMetricCost: z.number(),
    maxHops: z.number().int(),
    authorizationCode: z.string().optional(),
    transactionDate: z.string().optional(),
    reason: z.string().optional(),
  }),
});
