import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, type ApiServerDependencies } from '../api/server.js';
import { errorEnvelopeSchema, workflowEventSchema } from '../api/schemas.js';
import {
  encodeStreamCursor,
  resolveStreamBoundary,
  type StreamCursorPayload,
} from './stream-cursor.js';

const streamQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  eventType: z.string().trim().min(1).optional(),
});

const STREAM_POLL_INTERVAL_MS = 100;
const STREAM_HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_BATCH_LIMIT = 100;

export const serializeSseFrame = (params: { event: string; id: string; data: unknown }): string => {
  const payload = JSON.stringify(params.data);
  return `event: ${params.event}\nid: ${params.id}\ndata: ${payload}\n\n`;
};

export const serializeWorkflowEventFrame = (params: {
  cursorPayload: StreamCursorPayload;
  event: z.infer<typeof workflowEventSchema>;
}): string =>
  serializeSseFrame({
    event: 'workflow-event',
    id: encodeStreamCursor(params.cursorPayload),
    data: params.event,
  });

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const registerSseRunRoute = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/workflows/runs/:runId/stream',
    {
      schema: {
        querystring: streamQuerySchema,
        response: {
          200: {
            description: 'Server-Sent Events stream of workflow events',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                },
              },
            },
            headers: {
              'Content-Type': {
                schema: {
                  type: 'string',
                  enum: ['text/event-stream'],
                },
              },
            },
          },
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const runId = (request.params as { runId: string }).runId;
      const query = streamQuerySchema.parse(request.query);
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

      let boundarySequence = 0;
      try {
        boundarySequence = resolveStreamBoundary(runId, query.cursor);
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

      reply.hijack();
      const response = reply.raw;
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();

      let closed = false;
      let lastHeartbeatAt = Date.now();

      const markClosed = (): void => {
        closed = true;
      };

      request.raw.on('close', markClosed);
      response.on('close', markClosed);
      response.on('error', markClosed);

      while (!closed) {
        const conditions = ['run_id = $1', 'sequence > $2'];
        const values: unknown[] = [runId, boundarySequence];
        let index = 3;

        if (query.eventType) {
          conditions.push(`event_type = $${index}`);
          values.push(query.eventType);
          index += 1;
        }

        values.push(STREAM_BATCH_LIMIT);

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

        if (eventRows.rowCount && eventRows.rowCount > 0) {
          for (const row of eventRows.rows) {
            if (closed || response.writableEnded) {
              break;
            }

            const event = workflowEventSchema.parse({
              eventId: row.event_id,
              runId: row.run_id,
              sequence: row.sequence,
              eventType: row.event_type,
              timestamp: row.timestamp.toISOString(),
              payload: row.payload_jsonb,
              error: row.error_jsonb,
            });

            boundarySequence = row.sequence;
            response.write(
              serializeWorkflowEventFrame({
                cursorPayload: { runId, sequence: row.sequence },
                event,
              }),
            );
          }

          continue;
        }

        const now = Date.now();
        if (now - lastHeartbeatAt >= STREAM_HEARTBEAT_INTERVAL_MS && !response.writableEnded) {
          response.write(': keep-alive\n\n');
          lastHeartbeatAt = now;
        }

        await delay(STREAM_POLL_INTERVAL_MS);
      }

      if (!response.writableEnded) {
        response.end();
      }
    },
  );
};
