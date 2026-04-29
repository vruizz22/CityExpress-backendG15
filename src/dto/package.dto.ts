import { z } from 'zod';

export const PackageBodySchema = z.object({
  id: z.string().min(1),
  deliveryStrategy: z.string().min(1),
  maxHops: z.number().int(),
  createdAt: z.string().datetime(),
  deliverNotBefore: z.string().datetime().nullable().optional(),
  originId: z.string().min(1),
  destinationId: z.string().min(1),
  metaContent: z.string().nullable().optional(),
  isMetaEncrypted: z.boolean(),
  constraints: z.record(z.string(), z.unknown()).nullable().optional(),
  priorityClass: z.string().min(1),
  payment: z.number(),
});

export type PackageBody = z.infer<typeof PackageBodySchema>;

export const CreatePackageDtoSchema = z.object({
  idpk: z.string().min(1),
  type: z.string().min(1),
  packageBody: PackageBodySchema,
});

export type CreatePackageDto = z.infer<typeof CreatePackageDtoSchema>;

export const GetPackagesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  originId: z.string().optional(),
  destinationId: z.string().optional(),
  payment: z.string().optional(),
  deliveryStrategy: z.string().optional(),
  createdAt: z.string().optional(),
});

export type GetPackagesQuery = z.infer<typeof GetPackagesQuerySchema>;
