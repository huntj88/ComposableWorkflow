import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const startWorkflowRequestSchema = z.object({
  workflowType: z.string().trim().min(1),
  input: z.unknown(),
  idempotencyKey: z.string().trim().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const startWorkflowResponseSchema = z.object({
  runId: z.string(),
  workflowType: z.string(),
  workflowVersion: z.string(),
  lifecycle: z.literal('running'),
  startedAt: isoDateTime,
});

export type StartWorkflowRequest = z.infer<typeof startWorkflowRequestSchema>;
export type StartWorkflowResponse = z.infer<typeof startWorkflowResponseSchema>;
