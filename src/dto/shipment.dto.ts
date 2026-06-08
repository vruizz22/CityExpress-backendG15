import { z } from 'zod';
import { CITY_CODES } from '@config/city.config';

const cityCode = z
  .string()
  .min(1)
  .refine((c) => CITY_CODES.includes(c), {
    message: 'Ciudad de destino desconocida',
  });

const dimension = z.number().int().positive();

export const QuoteRequestSchema = z.object({
  destinationId: cityCode,
  height: dimension,
  width: dimension,
  depth: dimension,
  criteria: z.enum(['distance', 'price']),
  maxHops: z.number().int().positive(),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const CreateShipmentRequestSchema = QuoteRequestSchema.extend({
  deliverNotBefore: z.string().datetime().nullable().optional(),
  metaContent: z.string().nullable().optional(),
  deliveryStrategy: z.string().min(1).optional(),
  priorityClass: z.string().min(1).optional(),
});

export type CreateShipmentRequest = z.infer<typeof CreateShipmentRequestSchema>;

export interface QuoteResult {
  destinationId: string;
  criteria: 'distance' | 'price';
  routeMetricCost: number;
  hops: number;
  nextHop: string | null;
  path: string[];
  fPrice: number;
  amount: number;
  reachable: boolean;
  maxHopsOk: boolean;
}
