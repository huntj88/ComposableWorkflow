import { z } from 'zod';

import {
  listRunsResponseSchema,
  runEventsResponseSchema,
  runLogsResponseSchema,
  runSummaryResponseSchema,
  runTreeResponseSchema,
  startWorkflowRequestSchema,
  startWorkflowResponseSchema,
  workflowDefinitionResponseSchema,
  workflowEventDtoSchema,
  workflowLifecycleSchema,
} from '@composable-workflow/workflow-api-types';

const isoDateTime = z.string().datetime({ offset: true });

const commaSeparatedTextList = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  },
  z.array(z.string().min(1)),
);

export const errorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().min(1),
});

export const startWorkflowBodySchema = startWorkflowRequestSchema;

export { startWorkflowResponseSchema, workflowLifecycleSchema };

export const controlRequestBodySchema = z.object({
  reason: z.string().trim().min(1).optional(),
  requestedBy: z.string().trim().min(1).optional(),
});

export const controlResponseSchema = z.object({
  runId: z.string(),
  lifecycle: z.enum(['pausing', 'resuming', 'cancelling']),
  acceptedAt: isoDateTime,
});

export const invalidLifecycleErrorSchema = z.object({
  code: z.literal('INVALID_LIFECYCLE'),
  currentLifecycle: workflowLifecycleSchema,
});

export const reconcileRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    dryRun: z.coerce.boolean().default(false),
  })
  .default({
    limit: 100,
    dryRun: false,
  });

export const reconcileResponseSchema = z.object({
  scanned: z.number().int().nonnegative(),
  recovered: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  startedAt: isoDateTime,
  completedAt: isoDateTime,
});

export const workflowEventSchema = workflowEventDtoSchema;

export const runSummarySchema = runSummaryResponseSchema;

export const eventsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  eventType: z.string().trim().min(1).optional(),
  since: isoDateTime.optional(),
  until: isoDateTime.optional(),
});

export const eventsResponseSchema = runEventsResponseSchema;

export const logsResponseSchema = runLogsResponseSchema;

export { runTreeResponseSchema };

export const runsListQuerySchema = z.object({
  lifecycle: commaSeparatedTextList.optional(),
  workflowType: commaSeparatedTextList.optional(),
});

export const runsListResponseSchema = listRunsResponseSchema;

export const workflowDefinitionSchema = workflowDefinitionResponseSchema;

export const runTreeQuerySchema = z.object({
  depth: z.coerce.number().int().positive().max(10).optional(),
  includeCompletedChildren: z.coerce.boolean().default(true),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
