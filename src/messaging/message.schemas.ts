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

export const PackageTransitMessageSchema = BaseMessageSchema.extend({
  type: z.literal('package-transit'),
  packageBody: PackageBodySchema,
});

export const DistanceTableEntrySchema = z.object({
  destinationCode: z.string().min(1),
  destinationName: z.string().min(1),
  distance: z.number(),
  transportCost: z.number(),
  enabled: z.boolean(),
});

export const DistanceTableMessageSchema = BaseMessageSchema.extend({
  type: z.literal('distance-table'),
  data: z.object({
    distances: z.record(z.string(), DistanceTableEntrySchema),
  }),
});

export const AckMessageSchema = BaseMessageSchema.extend({
  type: z.enum(['ack', 'nack']),
});
