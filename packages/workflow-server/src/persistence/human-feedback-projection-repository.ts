import type { DbClient } from './db.js';
import type {
  HumanFeedbackOption,
  HumanFeedbackResponsePayload,
} from '../internal-workflows/human-feedback/contracts.js';

// Projection/read-model repository for human feedback request queries.
// Canonical lifecycle truth is stored in workflow_events.

export interface HumanFeedbackProjectionRequested {
  feedbackRunId: string;
  parentRunId: string;
  parentWorkflowType: string;
  parentState: string;
  questionId: string;
  requestEventId: string;
  prompt: string;
  options: HumanFeedbackOption[];
  constraints?: string[];
  correlationId?: string;
  requestedAt: string;
}

export interface HumanFeedbackProjectionResponded {
  feedbackRunId: string;
  respondedAt: string;
  response: HumanFeedbackResponsePayload;
  respondedBy?: string;
}

export interface HumanFeedbackProjectionCancelled {
  feedbackRunId: string;
  cancelledAt: string;
}

export interface HumanFeedbackProjectionRow {
  feedbackRunId: string;
  parentRunId: string;
  parentWorkflowType: string;
  parentState: string;
  questionId: string;
  requestEventId: string;
  prompt: string;
  options: HumanFeedbackOption[] | null;
  constraints: string[] | null;
  correlationId: string | null;
  status: 'awaiting_response' | 'responded' | 'cancelled';
  requestedAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
  response: HumanFeedbackResponsePayload | null;
  respondedBy: string | null;
}

interface HumanFeedbackProjectionRowResult {
  feedback_run_id: string;
  parent_run_id: string;
  parent_workflow_type: string;
  parent_state: string;
  question_id: string;
  request_event_id: string;
  prompt: string;
  options_json: HumanFeedbackOption[] | null;
  constraints_json: string[] | null;
  correlation_id: string | null;
  status: 'awaiting_response' | 'responded' | 'cancelled';
  requested_at: Date;
  responded_at: Date | null;
  cancelled_at: Date | null;
  response_json: HumanFeedbackResponsePayload | null;
  responded_by: string | null;
}

const mapProjectionRow = (row: HumanFeedbackProjectionRowResult): HumanFeedbackProjectionRow => ({
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
});

export interface HumanFeedbackProjectionRepository {
  recordRequested: (
    client: DbClient,
    input: HumanFeedbackProjectionRequested,
  ) => Promise<{ inserted: boolean }>;
  recordResponded: (
    client: DbClient,
    input: HumanFeedbackProjectionResponded,
  ) => Promise<{ applied: boolean }>;
  recordCancelled: (
    client: DbClient,
    input: HumanFeedbackProjectionCancelled,
  ) => Promise<{ applied: boolean }>;
  getByFeedbackRunId: (
    client: DbClient,
    feedbackRunId: string,
  ) => Promise<HumanFeedbackProjectionRow | null>;
}

export const createHumanFeedbackProjectionRepository = (): HumanFeedbackProjectionRepository => ({
  recordRequested: async (client, input) => {
    const result = await client.query(
      `
INSERT INTO human_feedback_requests (
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
  requested_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, 'awaiting_response', $11)
ON CONFLICT (feedback_run_id)
DO NOTHING
`,
      [
        input.feedbackRunId,
        input.parentRunId,
        input.parentWorkflowType,
        input.parentState,
        input.questionId,
        input.requestEventId,
        input.prompt,
        JSON.stringify(input.options),
        input.constraints ? JSON.stringify(input.constraints) : null,
        input.correlationId ?? null,
        input.requestedAt,
      ],
    );

    return {
      inserted: result.rowCount === 1,
    };
  },
  recordResponded: async (client, input) => {
    const result = await client.query(
      `
UPDATE human_feedback_requests
SET
  status = 'responded',
  responded_at = $2,
  response_json = $3::jsonb,
  responded_by = $4
WHERE feedback_run_id = $1
  AND status = 'awaiting_response'
`,
      [
        input.feedbackRunId,
        input.respondedAt,
        JSON.stringify(input.response),
        input.respondedBy ?? null,
      ],
    );

    return {
      applied: result.rowCount === 1,
    };
  },
  recordCancelled: async (client, input) => {
    const result = await client.query(
      `
UPDATE human_feedback_requests
SET
  status = 'cancelled',
  cancelled_at = $2
WHERE feedback_run_id = $1
  AND status = 'awaiting_response'
`,
      [input.feedbackRunId, input.cancelledAt],
    );

    return {
      applied: result.rowCount === 1,
    };
  },
  getByFeedbackRunId: async (client, feedbackRunId) => {
    const result = await client.query<HumanFeedbackProjectionRowResult>(
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
`,
      [feedbackRunId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapProjectionRow(result.rows[0]);
  },
});
