import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const cancelRunResponseSchema = z.object({
  runId: z.string(),
  lifecycle: z.literal('cancelling'),
  acceptedAt: isoDateTime,
});

export type CancelRunResponse = z.infer<typeof cancelRunResponseSchema>;
