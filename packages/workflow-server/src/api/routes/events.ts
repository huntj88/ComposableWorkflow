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

      const conditions = ['run_id = $1', 'sequence > $2'];
      const values: unknown[] = [runId, boundarySequence];
      let index = 3;

      if (query.eventType) {
        conditions.push(`event_type = $${index}`);
        values.push(query.eventType);
        index += 1;
      }

      if (query.since) {
        conditions.push(`timestamp >= $${index}`);
        values.push(query.since);
        index += 1;
      }

      if (query.until) {
        conditions.push(`timestamp <= $${index}`);
        values.push(query.until);
        index += 1;
      }

      values.push(query.limit + 1);

      const eventRows = await deps.pool.query<{
        event_id: string;
        run_id: string;
        sequence: number;
        event_type: string;
        timestamp: Date;
        payload_jsonb: Record<string, unknown> | null;
        error_jsonb: Record<string, unknown> | null;
      }>(
        `
SELECT
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
FROM workflow_events
WHERE ${conditions.join(' AND ')}
ORDER BY sequence ASC
LIMIT $${index}
`,
        values,
      );

      const rawItems = eventRows.rows.slice(0, query.limit).map((row) =>
        workflowEventSchema.parse({
          eventId: row.event_id,
          runId: row.run_id,
          sequence: row.sequence,
          eventType: row.event_type,
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
