import type { FastifyInstance } from 'fastify';

import {
  decodeEventCursor,
  encodeEventCursor,
  resolveSequenceBoundary,
} from '../../read-models/event-pagination.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import {
  errorEnvelopeSchema,
  eventsQuerySchema,
  eventsResponseSchema,
  workflowEventSchema,
} from '../schemas.js';

const toTransition = (payload: Record<string, unknown> | null) => {
  if (!payload) {
    return null;
  }

  const from = typeof payload.from === 'string' ? payload.from : undefined;
  const to = typeof payload.to === 'string' ? payload.to : undefined;
  const name = typeof payload.name === 'string' ? payload.name : undefined;

  if (!from && !to && !name) {
    return null;
  }

  return {
    from,
    to,
    name,
  };
};

const toChild = (payload: Record<string, unknown> | null) => {
  if (!payload) {
    return null;
  }

  const childRunId = typeof payload.childRunId === 'string' ? payload.childRunId : undefined;
  const childWorkflowType =
    typeof payload.childWorkflowType === 'string' ? payload.childWorkflowType : undefined;
  const lifecycle = typeof payload.lifecycle === 'string' ? payload.lifecycle : undefined;

  if (!childRunId || !childWorkflowType || !lifecycle) {
    return null;
  }

  return {
    childRunId,
    childWorkflowType,
    lifecycle,
  };
};

const toCommand = (payload: Record<string, unknown> | null) => {
  if (!payload) {
    return null;
  }

  const command = typeof payload.command === 'string' ? payload.command : undefined;
  if (!command) {
    return null;
  }

  return {
    command,
    args: Array.isArray(payload.args)
      ? payload.args.filter((value): value is string => typeof value === 'string')
      : undefined,
    stdin: typeof payload.stdin === 'string' ? payload.stdin : undefined,
    stdout: typeof payload.stdout === 'string' ? payload.stdout : undefined,
    stderr: typeof payload.stderr === 'string' ? payload.stderr : undefined,
    exitCode: typeof payload.exitCode === 'number' ? payload.exitCode : undefined,
  };
};

export const registerEventRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/workflows/runs/:runId/events',
    {
      schema: {
        querystring: eventsQuerySchema,
        response: {
          200: eventsResponseSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const query = eventsQuerySchema.parse(request.query);
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

      let boundarySequence: number;
      try {
        boundarySequence = resolveSequenceBoundary(runId, query.cursor);
      } catch (error) {
        throw new ApiError({
          statusCode: 400,
          code: 'INVALID_CURSOR',
          message: 'Cursor is invalid for this run',
          details: {
            reason: error instanceof Error ? error.message : 'invalid cursor',
          },
        });
      }

      const conditions = ['workflow_events.run_id = $1', 'workflow_events.sequence > $2'];
      const values: unknown[] = [runId, boundarySequence];
      let index = 3;

      if (query.eventType) {
        conditions.push(`workflow_events.event_type = $${index}`);
        values.push(query.eventType);
        index += 1;
      }

      if (query.since) {
        conditions.push(`workflow_events.timestamp >= $${index}`);
        values.push(query.since);
        index += 1;
      }

      if (query.until) {
        conditions.push(`workflow_events.timestamp <= $${index}`);
        values.push(query.until);
        index += 1;
      }

      values.push(query.limit + 1);

      const eventRows = await deps.pool.query<{
        event_id: string;
        run_id: string;
        workflow_type: string;
        parent_run_id: string | null;
        sequence: number;
        event_type: string;
        timestamp: Date;
        payload_jsonb: Record<string, unknown> | null;
        error_jsonb: Record<string, unknown> | null;
      }>(
        `
SELECT
  workflow_events.event_id,
  workflow_events.run_id,
  wr.workflow_type,
  wr.parent_run_id,
  workflow_events.sequence,
  workflow_events.event_type,
  workflow_events.timestamp,
  workflow_events.payload_jsonb,
  workflow_events.error_jsonb
FROM workflow_events
JOIN workflow_runs wr
  ON wr.run_id = workflow_events.run_id
WHERE ${conditions.join(' AND ')}
ORDER BY workflow_events.sequence ASC
LIMIT $${index}
`,
        values,
      );

      const rawItems = eventRows.rows.slice(0, query.limit).map((row) =>
        workflowEventSchema.parse({
          eventId: row.event_id,
          runId: row.run_id,
          workflowType: row.workflow_type,
          parentRunId: row.parent_run_id,
          sequence: row.sequence,
          eventType: row.event_type,
          state:
            typeof row.payload_jsonb?.state === 'string'
              ? row.payload_jsonb.state
              : typeof row.payload_jsonb?.to === 'string'
                ? row.payload_jsonb.to
                : null,
          transition: toTransition(row.payload_jsonb),
          child: toChild(row.payload_jsonb),
          command: toCommand(row.payload_jsonb),
          timestamp: row.timestamp.toISOString(),
          payload: row.payload_jsonb,
          error: row.error_jsonb,
        }),
      );

      const hasMore = eventRows.rows.length > query.limit;
      const last = rawItems.at(-1);

      if (query.cursor) {
        const cursorPayload = decodeEventCursor(query.cursor);
        if (cursorPayload.runId !== runId) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_CURSOR',
            message: 'Cursor runId does not match request runId',
          });
        }
      }

      return {
        items: rawItems,
        nextCursor:
          hasMore && last
            ? encodeEventCursor({
                runId,
                sequence: last.sequence,
              })
            : undefined,
      };
    },
  );
};
