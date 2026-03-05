import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const workflowLifecycleSchema = z.enum([
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
]);

export const childrenSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

export const runCountersSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  logCount: z.number().int().nonnegative(),
  childCount: z.number().int().nonnegative(),
});

export const runSummaryResponseSchema = z.object({
  runId: z.string(),
  workflowType: z.string(),
  workflowVersion: z.string(),
  lifecycle: workflowLifecycleSchema,
  currentState: z.string(),
  currentTransitionContext: z.record(z.unknown()).nullable().optional(),
  parentRunId: z.string().nullable(),
  childrenSummary: childrenSummarySchema,
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
  counters: runCountersSchema,
});

export const listRunsResponseSchema = z.object({
  items: z.array(runSummaryResponseSchema),
});

export type WorkflowLifecycle = z.infer<typeof workflowLifecycleSchema>;
export type RunSummaryResponse = z.infer<typeof runSummaryResponseSchema>;
export type ListRunsResponse = z.infer<typeof listRunsResponseSchema>;
