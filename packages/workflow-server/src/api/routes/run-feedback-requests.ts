import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import {
  listRunFeedbackRequestsQuerySchema,
  listRunFeedbackRequestsResponseSchema,
  runFeedbackRequestSummarySchema,
  type ListRunFeedbackRequestsQuery,
  type RunFeedbackRequestSummary,
} from '@composable-workflow/workflow-api-types';

import {
  createHumanFeedbackProjectionRepository,
  type HumanFeedbackProjectionCursor,
} from '../../persistence/human-feedback-projection-repository.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import { errorEnvelopeSchema } from '../schemas.js';

const projectionRepository = createHumanFeedbackProjectionRepository();

const cursorPayloadSchema = z.object({
  runId: z.string().min(1),
  requestedAt: z.string().datetime({ offset: true }),
  feedbackRunId: z.string().min(1),
});

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const decodeCursor = (cursor: string): CursorPayload => {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = JSON.parse(raw) as unknown;
  return cursorPayloadSchema.parse(parsed);
};

const parseStatuses = (
  statusCsv: ListRunFeedbackRequestsQuery['status'],
): Array<'awaiting_response' | 'responded' | 'cancelled'> => {
  return statusCsv
    .split(',')
    .map((status) => status.trim())
    .filter((status): status is 'awaiting_response' | 'responded' | 'cancelled' =>
      ['awaiting_response', 'responded', 'cancelled'].includes(status),
    );
};

const mapToSummary = (row: {
  feedbackRunId: string;
  parentRunId: string;
  questionId: string;
  status: 'awaiting_response' | 'responded' | 'cancelled';
  requestedAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
  respondedBy: string | null;
  prompt: string;
  options: Array<{ id: number; label: string; description?: string }> | null;
  constraints: string[] | null;
}): RunFeedbackRequestSummary =>
  runFeedbackRequestSummarySchema.parse({
    feedbackRunId: row.feedbackRunId,
    parentRunId: row.parentRunId,
    questionId: row.questionId,
    status: row.status,
    requestedAt: row.requestedAt,
    respondedAt: row.respondedAt,
    cancelledAt: row.cancelledAt,
    respondedBy: row.respondedBy,
    prompt: row.prompt,
    options: row.options,
    constraints: row.constraints,
  });

const toProjectionCursor = (
  runId: string,
  cursor?: string,
): HumanFeedbackProjectionCursor | undefined => {
  if (!cursor) {
    return undefined;
  }

  let decoded: CursorPayload;
  try {
    decoded = decodeCursor(cursor);
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

  if (decoded.runId !== runId) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_CURSOR',
      message: 'Cursor runId does not match request runId',
    });
  }

  return {
    requestedAt: decoded.requestedAt,
    feedbackRunId: decoded.feedbackRunId,
  };
};

export const registerRunFeedbackRequestRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/workflows/runs/:runId/feedback-requests',
    {
      schema: {
        querystring: listRunFeedbackRequestsQuerySchema,
        response: {
          200: listRunFeedbackRequestsResponseSchema,
          400: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const query = listRunFeedbackRequestsQuerySchema.parse(request.query);
      const statuses = parseStatuses(query.status);
      const limit = query.limit;
      const cursor = toProjectionCursor(runId, query.cursor);

      const rows = await projectionRepository.listByParentRunId(deps.pool, {
        parentRunId: runId,
        statuses,
        limit,
        cursor,
      });

      const hasMore = rows.length > limit;
      const visibleRows = rows.slice(0, limit);
      const items = visibleRows.map((row) => mapToSummary(row));
      const last = items.at(-1);

      return listRunFeedbackRequestsResponseSchema.parse({
        items,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                runId,
                requestedAt: last.requestedAt,
                feedbackRunId: last.feedbackRunId,
              })
            : undefined,
      });
    },
  );
};
