import { z } from 'zod';
import { PackageBodySchema } from '@dto/package.dto';

export const MessageEnvelopeSchema = z.object({
  idpk: z.string().min(1),
  msgId: z.string().min(1),
  type: z.string().min(1),
  cityId: z.string().min(1).optional(),
});

export const BaseMessageSchema = MessageEnvelopeSchema.extend({
  timestamp: z.string().datetime(),
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

export const DistanceTableMessageSchema = BaseMessageSchema.extend({
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
