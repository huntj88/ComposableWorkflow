import type { FastifyInstance } from 'fastify';

import {
  buildDynamicOverlay,
  projectRunTree,
  type RunChildLinkRecord,
  type RunTreeNodeRecord,
  type TransitionEdge,
} from '../../read-models/run-tree-projection.js';
import { registerLifecycleControlRoutes } from '../../lifecycle/control-routes.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import {
  errorEnvelopeSchema,
  logsResponseSchema,
  runSummarySchema,
  runTreeQuerySchema,
  runTreeResponseSchema,
  runsListQuerySchema,
  runsListResponseSchema,
} from '../schemas.js';
import { inspectRegistrationDefinition } from './definitions.js';

interface SummaryRow {
  run_id: string;
  workflow_type: string;
  workflow_version: string;
  lifecycle: string;
  current_state: string;
  parent_run_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  children_total: number;
  children_active: number;
  children_completed: number;
  children_failed: number;
  children_cancelled: number;
  event_count: number;
  log_count: number;
}

const summarySelectSql = `
SELECT
  wr.run_id,
  wr.workflow_type,
  wr.workflow_version,
  wr.lifecycle,
  wr.current_state,
  wr.parent_run_id,
  wr.started_at,
  wr.ended_at,
  COALESCE(children.total, 0)::int AS children_total,
  COALESCE(children.active, 0)::int AS children_active,
  COALESCE(children.completed, 0)::int AS children_completed,
  COALESCE(children.failed, 0)::int AS children_failed,
  COALESCE(children.cancelled, 0)::int AS children_cancelled,
  COALESCE(counters.event_count, 0)::int AS event_count,
  COALESCE(counters.log_count, 0)::int AS log_count
FROM workflow_runs wr
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (
      WHERE child.lifecycle IN (
        'pending',
        'running',
        'pausing',
        'paused',
        'resuming',
        'recovering',
        'cancelling'
      )
    )::int AS active,
    COUNT(*) FILTER (WHERE child.lifecycle = 'completed')::int AS completed,
    COUNT(*) FILTER (WHERE child.lifecycle = 'failed')::int AS failed,
    COUNT(*) FILTER (WHERE child.lifecycle = 'cancelled')::int AS cancelled
  FROM workflow_run_children wrc
  JOIN workflow_runs child
    ON child.run_id = wrc.child_run_id
  WHERE wrc.parent_run_id = wr.run_id
) children ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS event_count,
    COUNT(*) FILTER (WHERE event_type = 'log')::int AS log_count
  FROM workflow_events ev
  WHERE ev.run_id = wr.run_id
) counters ON true
`;

const mapSummaryRow = (row: SummaryRow) =>
  runSummarySchema.parse({
    runId: row.run_id,
    workflowType: row.workflow_type,
    workflowVersion: row.workflow_version,
    lifecycle: row.lifecycle,
    currentState: row.current_state,
    currentTransitionContext: null,
    parentRunId: row.parent_run_id,
    childrenSummary: {
      total: row.children_total,
      active: row.children_active,
      completed: row.children_completed,
      failed: row.children_failed,
      cancelled: row.children_cancelled,
    },
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    counters: {
      eventCount: row.event_count,
      logCount: row.log_count,
      childCount: row.children_total,
    },
  });

export const getRunSummaryById = async (deps: ApiServerDependencies, runId: string) => {
  const result = await deps.pool.query<SummaryRow>(`${summarySelectSql} WHERE wr.run_id = $1`, [
    runId,
  ]);

  if (result.rowCount === 0) {
    return null;
  }

  return mapSummaryRow(result.rows[0]);
};

const getRunTreeRows = async (
  deps: ApiServerDependencies,
  params: { runId: string; depth?: number; includeCompletedChildren: boolean },
) => {
  const rows = await deps.pool.query<{
    run_id: string;
    workflow_type: string;
    workflow_version: string;
    lifecycle: string;
    current_state: string;
    parent_run_id: string | null;
    started_at: Date;
    ended_at: Date | null;
  }>(
    `
WITH RECURSIVE tree AS (
  SELECT
    wr.run_id,
    wr.workflow_type,
    wr.workflow_version,
    wr.lifecycle,
    wr.current_state,
    wr.parent_run_id,
    wr.started_at,
    wr.ended_at,
    0::int AS depth
  FROM workflow_runs wr
  WHERE wr.run_id = $1

  UNION ALL

  SELECT
    child.run_id,
    child.workflow_type,
    child.workflow_version,
    child.lifecycle,
    child.current_state,
    child.parent_run_id,
    child.started_at,
    child.ended_at,
    tree.depth + 1
  FROM tree
  JOIN workflow_run_children wrc
    ON wrc.parent_run_id = tree.run_id
  JOIN workflow_runs child
    ON child.run_id = wrc.child_run_id
  WHERE ($2::int IS NULL OR tree.depth < $2)
    AND ($3::boolean OR child.lifecycle NOT IN ('completed', 'failed', 'cancelled'))
)
SELECT
  run_id,
  workflow_type,
  workflow_version,
  lifecycle,
  current_state,
  parent_run_id,
  started_at,
  ended_at
FROM tree
`,
    [params.runId, params.depth ?? null, params.includeCompletedChildren],
  );

  const nodes: RunTreeNodeRecord[] = rows.rows.map((row) => ({
    runId: row.run_id,
    workflowType: row.workflow_type,
    workflowVersion: row.workflow_version,
    lifecycle: row.lifecycle,
    currentState: row.current_state,
    parentRunId: row.parent_run_id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
  }));

  if (nodes.length === 0) {
    throw new ApiError({
      statusCode: 404,
      code: 'RUN_NOT_FOUND',
      message: `Run ${params.runId} not found`,
    });
  }

  const runIds = nodes.map((node) => node.runId);
  const linksQuery = await deps.pool.query<{
    parent_run_id: string;
    child_run_id: string;
    parent_state: string;
    created_at: Date;
    linked_by_event_id: string;
  }>(
    `
SELECT
  parent_run_id,
  child_run_id,
  parent_state,
  created_at,
  linked_by_event_id
FROM workflow_run_children
WHERE parent_run_id = ANY($1::text[])
  AND child_run_id = ANY($1::text[])
ORDER BY created_at ASC
`,
    [runIds],
  );

  const links: RunChildLinkRecord[] = linksQuery.rows.map((row) => ({
    parentRunId: row.parent_run_id,
    childRunId: row.child_run_id,
    parentState: row.parent_state,
    createdAt: row.created_at.toISOString(),
    linkedByEventId: row.linked_by_event_id,
  }));

  return {
    nodes,
    links,
  };
};

export const registerRunRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  await registerLifecycleControlRoutes(server, deps);

  server.get(
    '/api/v1/workflows/runs/:runId',
    {
      schema: {
        response: {
          200: runSummarySchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const summary = await getRunSummaryById(deps, runId);

      if (!summary) {
        throw new ApiError({
          statusCode: 404,
          code: 'RUN_NOT_FOUND',
          message: `Run ${runId} not found`,
        });
      }

      return summary;
    },
  );

  server.get(
    '/api/v1/workflows/runs',
    {
      schema: {
        querystring: runsListQuerySchema,
        response: {
          200: runsListResponseSchema,
          400: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const query = runsListQuerySchema.parse(request.query);
      const result = await deps.pool.query<SummaryRow>(
        `${summarySelectSql}
         WHERE ($1::text[] IS NULL OR wr.lifecycle = ANY($1))
           AND ($2::text[] IS NULL OR wr.workflow_type = ANY($2))
         ORDER BY wr.started_at DESC
         LIMIT 200`,
        [query.lifecycle ?? null, query.workflowType ?? null],
      );

      return {
        items: result.rows.map(mapSummaryRow),
      };
    },
  );

  server.get(
    '/api/v1/workflows/runs/:runId/tree',
    {
      schema: {
        querystring: runTreeQuerySchema,
        response: {
          200: runTreeResponseSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const query = runTreeQuerySchema.parse(request.query);
      const { nodes, links } = await getRunTreeRows(deps, {
        runId,
        depth: query.depth,
        includeCompletedChildren: query.includeCompletedChildren,
      });

      const root = projectRunTree(runId, nodes, links);

      const eventsResult = await deps.pool.query<{
        sequence: number;
        event_type: string;
        timestamp: Date;
        payload_jsonb: Record<string, unknown> | null;
      }>(
        `
SELECT sequence, event_type, timestamp, payload_jsonb
FROM workflow_events
WHERE run_id = $1
ORDER BY sequence ASC
`,
        [runId],
      );

      const registration = deps.registry.getByType(root.workflowType);
      const definition = registration ? inspectRegistrationDefinition(registration) : null;
      const transitions: TransitionEdge[] = definition?.transitions ?? [];

      const overlay = buildDynamicOverlay({
        runId,
        activeNode: root.currentState,
        transitions,
        childLinks: links,
        events: eventsResult.rows.map((event) => ({
          sequence: event.sequence,
          eventType: event.event_type,
          timestamp: event.timestamp.toISOString(),
          payload: event.payload_jsonb,
        })),
      });

      return {
        tree: root,
        overlay,
      };
    },
  );

  server.get(
    '/api/v1/workflows/runs/:runId/logs',
    {
      schema: {
        response: {
          200: logsResponseSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const runExists = await deps.pool.query('SELECT 1 FROM workflow_runs WHERE run_id = $1', [
        runId,
      ]);

      if (runExists.rowCount === 0) {
        throw new ApiError({
          statusCode: 404,
          code: 'RUN_NOT_FOUND',
          message: `Run ${runId} not found`,
        });
      }

      const logs = await deps.pool.query<{
        event_id: string;
        run_id: string;
        sequence: number;
        event_type: string;
        timestamp: Date;
        payload_jsonb: Record<string, unknown> | null;
      }>(
        `
SELECT
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND (event_type = 'log' OR event_type LIKE 'command.%')
ORDER BY sequence ASC
`,
        [runId],
      );

      return {
        items: logs.rows.map((row) => ({
          eventId: row.event_id,
          runId: row.run_id,
          sequence: row.sequence,
          eventType: row.event_type,
          timestamp: row.timestamp.toISOString(),
          level: typeof row.payload_jsonb?.level === 'string' ? row.payload_jsonb.level : 'info',
          message:
            typeof row.payload_jsonb?.message === 'string'
              ? row.payload_jsonb.message
              : row.event_type,
          payload: row.payload_jsonb,
        })),
      };
    },
  );
};
