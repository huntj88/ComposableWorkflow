import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  workflowEventDtoSchema,
  workflowStreamFrameSchema,
} from '@composable-workflow/workflow-api-types';

import { ApiError, type ApiServerDependencies } from '../api/server.js';
import { errorEnvelopeSchema } from '../api/schemas.js';
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

export const serializeSseFrame = (params: { event: string; id: string; data: unknown }): string => {
  const payload = JSON.stringify(params.data);
  return `event: ${params.event}\nid: ${params.id}\ndata: ${payload}\n\n`;
};

export const serializeWorkflowEventFrame = (params: {
  cursorPayload: StreamCursorPayload;
  event: z.infer<typeof workflowEventDtoSchema>;
}): string =>
  serializeSseFrame(
    workflowStreamFrameSchema.parse({
      event: 'workflow-event',
      id: encodeStreamCursor(params.cursorPayload),
      data: params.event,
    }),
  );

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
        const conditions = ['workflow_events.run_id = $1', 'workflow_events.sequence > $2'];
        const values: unknown[] = [runId, boundarySequence];
        let index = 3;

        if (query.eventType) {
          conditions.push(`workflow_events.event_type = $${index}`);
          values.push(query.eventType);
          index += 1;
        }

        values.push(STREAM_BATCH_LIMIT);

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

        if (eventRows.rowCount && eventRows.rowCount > 0) {
          for (const row of eventRows.rows) {
            if (closed || response.writableEnded) {
              break;
            }

            const event = workflowEventDtoSchema.parse({
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
