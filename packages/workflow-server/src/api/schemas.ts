import { z } from 'zod';

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

export const startWorkflowBodySchema = z.object({
  workflowType: z.string().trim().min(1),
  input: z.unknown(),
  idempotencyKey: z.string().trim().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const workflowEventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  sequence: z.number().int().positive(),
  eventType: z.string(),
  timestamp: isoDateTime,
  payload: z.record(z.unknown()).nullable(),
  error: z.record(z.unknown()).nullable(),
});

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

export const runSummarySchema = z.object({
  runId: z.string(),
  workflowType: z.string(),
  workflowVersion: z.string(),
  lifecycle: z.string(),
  currentState: z.string(),
  currentTransitionContext: z.record(z.unknown()).nullable().optional(),
  parentRunId: z.string().nullable(),
  childrenSummary: childrenSummarySchema,
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
  counters: runCountersSchema,
});

export const eventsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  eventType: z.string().trim().min(1).optional(),
  since: isoDateTime.optional(),
  until: isoDateTime.optional(),
});

export const eventsResponseSchema = z.object({
  items: z.array(workflowEventSchema),
  nextCursor: z.string().optional(),
});

export const logsResponseSchema = z.object({
  items: z.array(
    z.object({
      eventId: z.string(),
      runId: z.string(),
      sequence: z.number().int().positive(),
      eventType: z.string(),
      timestamp: isoDateTime,
      level: z.string(),
      message: z.string(),
      payload: z.record(z.unknown()).nullable(),
    }),
  ),
});

const runTreeNodeSchema: z.ZodType<{
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  currentState: string;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
  children: unknown[];
}> = z.lazy(() =>
  z.object({
    runId: z.string(),
    workflowType: z.string(),
    workflowVersion: z.string(),
    lifecycle: z.string(),
    currentState: z.string(),
    parentRunId: z.string().nullable(),
    startedAt: isoDateTime,
    endedAt: isoDateTime.nullable(),
    children: z.array(runTreeNodeSchema),
  }),
);

export const dynamicOverlaySchema = z.object({
  runId: z.string(),
  activeNode: z.string(),
  traversedEdges: z.array(
    z.object({ from: z.string(), to: z.string(), name: z.string().optional() }),
  ),
  pendingEdges: z.array(
    z.object({ from: z.string(), to: z.string(), name: z.string().optional() }),
  ),
  failedEdges: z.array(z.object({ from: z.string(), to: z.string(), name: z.string().optional() })),
  childGraphLinks: z.array(
    z.object({
      parentRunId: z.string(),
      childRunId: z.string(),
      parentState: z.string(),
      createdAt: isoDateTime,
      linkedByEventId: z.string(),
    }),
  ),
  transitionTimeline: z.array(
    z.object({
      sequence: z.number().int().positive(),
      eventType: z.string(),
      timestamp: isoDateTime,
      from: z.string().optional(),
      to: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
});

export const runTreeResponseSchema = z.object({
  tree: runTreeNodeSchema,
  overlay: dynamicOverlaySchema,
});

export const runsListQuerySchema = z.object({
  lifecycle: commaSeparatedTextList.optional(),
  workflowType: commaSeparatedTextList.optional(),
});

export const runsListResponseSchema = z.object({
  items: z.array(runSummarySchema),
});

export const workflowDefinitionSchema = z.object({
  workflowType: z.string(),
  workflowVersion: z.string(),
  states: z.array(z.string()),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      name: z.string().optional(),
    }),
  ),
  childLaunchAnnotations: z.array(z.record(z.unknown())),
  metadata: z.record(z.unknown()),
});

export const runTreeQuerySchema = z.object({
  depth: z.coerce.number().int().positive().max(10).optional(),
  includeCompletedChildren: z.coerce.boolean().default(true),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
