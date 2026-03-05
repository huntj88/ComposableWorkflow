import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export interface RunTreeNode {
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  currentState: string;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
  children: RunTreeNode[];
}

export const runTreeNodeSchema: z.ZodType<RunTreeNode> = z.lazy(() =>
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

export type RunTreeResponse = z.infer<typeof runTreeResponseSchema>;
