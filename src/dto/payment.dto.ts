import { z } from 'zod';

export const InitPaymentRequestSchema = z.object({
  shipmentId: z.string().min(1),
  returnUrl: z.string().url().optional(),
});

export type InitPaymentRequest = z.infer<typeof InitPaymentRequestSchema>;

export const CommitPaymentRequestSchema = z.object({
  token_ws: z.string().min(1).optional(),
  ws_token: z.string().min(1).optional(),
  TBK_TOKEN: z.string().min(1).optional(),
});

export type CommitPaymentRequest = z.infer<typeof CommitPaymentRequestSchema>;
