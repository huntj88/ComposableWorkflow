import { z } from 'zod';

export const errorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().min(1),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
