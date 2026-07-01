import { z } from 'zod';
import { CITY_CODES } from '@config/city.config';

const cityCode = z
  .string()
  .min(1)
  .refine((c) => CITY_CODES.includes(c), {
    message: 'Ciudad de destino desconocida',
  });

const dimension = z.number().int().positive();

export const MIN_PERIOD_SECONDS = 60;
export const MAX_PERIOD_SECONDS = 2 * 24 * 60 * 60;
export const MAX_SUBSCRIPTION_AMOUNT = 100;

// RF01
export const CreateSubscriptionSchema = z.object({
  destinationId: cityCode,
  height: dimension,
  width: dimension,
  depth: dimension,
  criteria: z.enum(['distance', 'price']).default('distance'),
  maxHops: z.number().int().positive(),
  deliveryStrategy: z.string().min(1).optional(),
  priorityClass: z.enum(['low', 'medium', 'high']).default('medium'), // RF03
  insured: z.boolean().default(false), // RF02
  metaContent: z.string().nullable().optional(),
  periodSeconds: z
    .number()
    .int()
    .min(MIN_PERIOD_SECONDS, {
      message: 'La periodicidad mínima es 1 minuto (60s).',
    })
    .max(MAX_PERIOD_SECONDS, {
      message: 'La periodicidad máxima es 2 días (172800s).',
    }),
  amount: z
    .number()
    .int()
    .min(1)
    .max(MAX_SUBSCRIPTION_AMOUNT, {
      message: `La cantidad máxima de envíos es ${MAX_SUBSCRIPTION_AMOUNT}.`,
    }),
  budget: z.number().int().positive(),
});

export type CreateSubscriptionRequest = z.infer<
  typeof CreateSubscriptionSchema
>;

// RF01
export const TickRequestSchema = z.object({
  tickNumber: z.number().int().min(0),
});

export type TickRequest = z.infer<typeof TickRequestSchema>;
