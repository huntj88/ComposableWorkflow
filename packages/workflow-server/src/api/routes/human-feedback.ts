import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { HumanFeedbackProjectionRow } from '../../persistence/human-feedback-projection-repository.js';
import { withTransaction, type DbClient } from '../../persistence/db.js';
import { createEventRepository } from '../../persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../persistence/human-feedback-projection-repository.js';
import { createRunRepository } from '../../persistence/run-repository.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import { errorEnvelopeSchema } from '../schemas.js';
import {
  humanFeedbackListQuerySchema,
  humanFeedbackListResponseSchema,
  humanFeedbackRequestStatusSchema,
  humanFeedbackRespondBodySchema,
  humanFeedbackRespondConflictSchema,
  humanFeedbackRespondSuccessSchema,
} from '../schemas/human-feedback.js';

interface RunLifecycleRow {
  run_id: string;
  parent_run_id: string | null;
  lifecycle: string;
}

const eventRepository = createEventRepository();
const runRepository = createRunRepository();
const projectionRepository = createHumanFeedbackProjectionRepository();

const COMPLETION_CONFIRMATION_MARKERS = [
  'completion-confirmation',
  'completion_confirmation',
  'completion confirmation',
];

const includesCompletionConfirmationMarker = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return COMPLETION_CONFIRMATION_MARKERS.some((marker) => normalized.includes(marker));
};

const isCompletionConfirmationRequest = (row: {
  questionId: string;
  prompt: string;
  constraints: string[] | null;
}): boolean => {
  if (includesCompletionConfirmationMarker(row.questionId)) {
    return true;
  }

  if (includesCompletionConfirmationMarker(row.prompt)) {
    return true;
  }

  for (const constraint of row.constraints ?? []) {
    if (includesCompletionConfirmationMarker(constraint)) {
      return true;
    }
  }

  return false;
};

const eventId = (): string => `evt_${randomUUID()}`;

const getProjectionForUpdate = async (
  client: DbClient,
  feedbackRunId: string,
): Promise<HumanFeedbackProjectionRow | null> => {
  const result = await client.query<{
    feedback_run_id: string;
    parent_run_id: string;
    parent_workflow_type: string;
    parent_state: string;
    question_id: string;
    request_event_id: string;
    prompt: string;
    options_json: Array<{ id: number; label: string; description?: string }> | null;
    constraints_json: string[] | null;
    correlation_id: string | null;
    status: 'awaiting_response' | 'responded' | 'cancelled';
    requested_at: Date;
    responded_at: Date | null;
    cancelled_at: Date | null;
    response_json: { questionId: string; selectedOptionIds?: number[]; text?: string } | null;
    responded_by: string | null;
  }>(
    `
SELECT
  feedback_run_id,
  parent_run_id,
  parent_workflow_type,
  parent_state,
  question_id,
  request_event_id,
  prompt,
  options_json,
  constraints_json,
  correlation_id,
  status,
  requested_at,
  responded_at,
  cancelled_at,
  response_json,
  responded_by
FROM human_feedback_requests
WHERE feedback_run_id = $1
FOR UPDATE
`,
    [feedbackRunId],
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const row = result.rows[0];
  return {
    feedbackRunId: row.feedback_run_id,
    parentRunId: row.parent_run_id,
    parentWorkflowType: row.parent_workflow_type,
    parentState: row.parent_state,
    questionId: row.question_id,
    requestEventId: row.request_event_id,
    prompt: row.prompt,
    options: row.options_json,
    constraints: row.constraints_json,
    correlationId: row.correlation_id,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    response: row.response_json,
    respondedBy: row.responded_by,
  };
};

const mapStatusRow = (row: HumanFeedbackProjectionRow) =>
  humanFeedbackRequestStatusSchema.parse({
    feedbackRunId: row.feedbackRunId,
    parentRunId: row.parentRunId,
    parentWorkflowType: row.parentWorkflowType,
    parentState: row.parentState,
    questionId: row.questionId,
    requestEventId: row.requestEventId,
    prompt: row.prompt,
    options: row.options,
    constraints: row.constraints,
    correlationId: row.correlationId,
    status: row.status,
    requestedAt: row.requestedAt,
    respondedAt: row.respondedAt,
    cancelledAt: row.cancelledAt,
    response: row.response,
    respondedBy: row.respondedBy,
  });

const validateRespondRequest = (params: {
  row: HumanFeedbackProjectionRow;
  response: { questionId: string; selectedOptionIds?: number[]; text?: string };
}): void => {
  if (params.response.questionId !== params.row.questionId) {
    throw new ApiError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'response.questionId must match the active feedback questionId',
      details: {
        field: 'response.questionId',
      },
    });
  }

  const availableIds = new Set((params.row.options ?? []).map((option) => option.id));
  const selectedOptionIds = params.response.selectedOptionIds ?? [];

  for (const optionId of selectedOptionIds) {
    if (!availableIds.has(optionId)) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'response.selectedOptionIds contains unknown option IDs',
        details: {
          field: 'response.selectedOptionIds',
          unknownOptionId: optionId,
        },
      });
    }
  }

  if (
    isCompletionConfirmationRequest({
      questionId: params.row.questionId,
      prompt: params.row.prompt,
      constraints: params.row.constraints,
    }) &&
    selectedOptionIds.length !== 1
  ) {
    throw new ApiError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'completion-confirmation responses require exactly one selected option ID',
      details: {
        field: 'response.selectedOptionIds',
      },
    });
  }
};

const readRunLifecycleForUpdate = async (
  client: DbClient,
  runId: string,
): Promise<RunLifecycleRow> => {
  const result = await client.query<RunLifecycleRow>(
    'SELECT run_id, parent_run_id, lifecycle FROM workflow_runs WHERE run_id = $1 FOR UPDATE',
    [runId],
  );

  if (result.rowCount !== 1) {
    throw new ApiError({
      statusCode: 404,
      code: 'FEEDBACK_REQUEST_NOT_FOUND',
      message: `Feedback request ${runId} not found`,
    });
  }

  return result.rows[0];
};

export const registerHumanFeedbackRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/human-feedback/requests',
    {
      schema: {
        querystring: humanFeedbackListQuerySchema,
        response: {
          200: humanFeedbackListResponseSchema,
          400: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const query = humanFeedbackListQuerySchema.parse(request.query);
      const values: unknown[] = [];
      const where: string[] = [];

      if (query.status) {
        values.push(query.status);
        where.push(`status = $${values.length}`);
      }

      const sql = `
SELECT
  feedback_run_id,
  parent_run_id,
  parent_workflow_type,
  parent_state,
  question_id,
  request_event_id,
  prompt,
  options_json,
  constraints_json,
  correlation_id,
  status,
  requested_at,
  responded_at,
  cancelled_at,
  response_json,
  responded_by
FROM human_feedback_requests
${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
ORDER BY requested_at DESC
LIMIT 200
`;

      const rows = await deps.pool.query<{
        feedback_run_id: string;
        parent_run_id: string;
        parent_workflow_type: string;
        parent_state: string;
        question_id: string;
        request_event_id: string;
        prompt: string;
        options_json: Array<{ id: number; label: string; description?: string }> | null;
        constraints_json: string[] | null;
        correlation_id: string | null;
        status: 'awaiting_response' | 'responded' | 'cancelled';
        requested_at: Date;
        responded_at: Date | null;
        cancelled_at: Date | null;
        response_json: { questionId: string; selectedOptionIds?: number[]; text?: string } | null;
        responded_by: string | null;
      }>(sql, values);

      return {
        items: rows.rows.map((row) =>
          mapStatusRow({
            feedbackRunId: row.feedback_run_id,
            parentRunId: row.parent_run_id,
            parentWorkflowType: row.parent_workflow_type,
            parentState: row.parent_state,
            questionId: row.question_id,
            requestEventId: row.request_event_id,
            prompt: row.prompt,
            options: row.options_json,
            constraints: row.constraints_json,
            correlationId: row.correlation_id,
            status: row.status,
            requestedAt: row.requested_at.toISOString(),
            respondedAt: row.responded_at?.toISOString() ?? null,
            cancelledAt: row.cancelled_at?.toISOString() ?? null,
            response: row.response_json,
            respondedBy: row.responded_by,
          }),
        ),
      };
    },
  );

  server.get(
    '/api/v1/human-feedback/requests/:feedbackRunId',
    {
      schema: {
        response: {
          200: humanFeedbackRequestStatusSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const feedbackRunId = (request.params as { feedbackRunId: string }).feedbackRunId;

      const row = await withTransaction(deps.pool, async (client) =>
        getProjectionForUpdate(client, feedbackRunId),
      );
      if (!row) {
        throw new ApiError({
          statusCode: 404,
          code: 'FEEDBACK_REQUEST_NOT_FOUND',
          message: `Feedback request ${feedbackRunId} not found`,
        });
      }

      return mapStatusRow(row);
    },
  );

  server.post(
    '/api/v1/human-feedback/requests/:feedbackRunId/respond',
    {
      schema: {
        body: humanFeedbackRespondBodySchema,
        response: {
          200: humanFeedbackRespondSuccessSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: humanFeedbackRespondConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const feedbackRunId = (request.params as { feedbackRunId: string }).feedbackRunId;
      const body = humanFeedbackRespondBodySchema.parse(request.body);

      const result = await withTransaction(deps.pool, async (client) => {
        const projection = await getProjectionForUpdate(client, feedbackRunId);
        if (!projection) {
          throw new ApiError({
            statusCode: 404,
            code: 'FEEDBACK_REQUEST_NOT_FOUND',
            message: `Feedback request ${feedbackRunId} not found`,
          });
        }

        if (projection.status !== 'awaiting_response') {
          return {
            kind: 'conflict' as const,
            body: humanFeedbackRespondConflictSchema.parse({
              feedbackRunId,
              status: projection.status,
              respondedAt: projection.respondedAt,
              cancelledAt: projection.cancelledAt,
            }),
          };
        }

        const run = await readRunLifecycleForUpdate(client, feedbackRunId);
        if (run.lifecycle !== 'running') {
          return {
            kind: 'conflict' as const,
            body: humanFeedbackRespondConflictSchema.parse({
              feedbackRunId,
              status: projection.status,
              respondedAt: projection.respondedAt,
              cancelledAt: projection.cancelledAt,
            }),
          };
        }

        validateRespondRequest({ row: projection, response: body.response });

        const respondedAt = new Date().toISOString();

        await eventRepository.appendEvent(client, {
          eventId: eventId(),
          runId: feedbackRunId,
          eventType: 'human-feedback.received',
          timestamp: respondedAt,
          payload: {
            feedbackRunId,
            parentRunId: projection.parentRunId,
            questionId: projection.questionId,
            respondedBy: body.respondedBy,
          },
        });

        const projectionWrite = await projectionRepository.recordResponded(client, {
          feedbackRunId,
          respondedAt,
          respondedBy: body.respondedBy,
          response: body.response,
        });

        if (!projectionWrite.applied) {
          const currentProjection = await getProjectionForUpdate(client, feedbackRunId);
          return {
            kind: 'conflict' as const,
            body: humanFeedbackRespondConflictSchema.parse({
              feedbackRunId,
              status: currentProjection?.status ?? 'awaiting_response',
              respondedAt: currentProjection?.respondedAt ?? null,
              cancelledAt: currentProjection?.cancelledAt ?? null,
            }),
          };
        }

        await eventRepository.appendEvent(client, {
          eventId: eventId(),
          runId: feedbackRunId,
          eventType: 'workflow.completed',
          timestamp: respondedAt,
          payload: {
            output: {
              status: 'responded',
              response: body.response,
              respondedAt,
            },
          },
        });

        const existingRun = await runRepository.getRunSummary(client, feedbackRunId);
        if (!existingRun) {
          throw new ApiError({
            statusCode: 404,
            code: 'FEEDBACK_REQUEST_NOT_FOUND',
            message: `Feedback request ${feedbackRunId} not found`,
          });
        }

        await runRepository.upsertRunSummary(client, {
          ...existingRun,
          lifecycle: 'completed',
          endedAt: respondedAt,
        });

        return {
          kind: 'accepted' as const,
          parentRunId: run.parent_run_id,
          body: humanFeedbackRespondSuccessSchema.parse({
            feedbackRunId,
            status: 'accepted',
            acceptedAt: respondedAt,
          }),
        };
      });

      if (result.kind === 'conflict') {
        return reply.code(409).send(result.body);
      }

      if (result.parentRunId) {
        void deps.orchestrator.resumeRun(result.parentRunId).catch(() => undefined);
      }

      return result.body;
    },
  );
};
