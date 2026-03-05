import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { SUCCESS_WORKFLOW_TYPE, createE2eHarness, startWorkflow } from '../setup.js';

interface FeedbackListResponse {
  items: Array<{
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
  }>;
  nextCursor?: string;
}

describe('e2e.behaviors.api-feedback-requests', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-API-009 returns run-scoped, filtered, and stably paginated feedback requests', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parent = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-parent' },
    });

    const unrelatedParent = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-unrelated' },
    });

    const feedbackA = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-a' },
    });
    const feedbackB = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-b' },
    });
    const feedbackC = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-c' },
    });
    const feedbackUnrelated = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: { requestId: 'api-feedback-unrelated-feedback' },
    });

    await harness.db.pool.query(
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
  requested_at,
  responded_at,
  cancelled_at,
  response_json,
  responded_by
)
VALUES
  ($1, $2, $3, 'awaiting-feedback', 'q_newest', 'evt_q_newest', 'Newest prompt', $4::jsonb, NULL, NULL, 'awaiting_response', $5, NULL, NULL, NULL, NULL),
  ($6, $2, $3, 'awaiting-feedback', 'q_cancelled', 'evt_q_cancelled', 'Cancelled prompt', $4::jsonb, NULL, NULL, 'cancelled', $7, NULL, $8, NULL, NULL),
  ($9, $2, $3, 'awaiting-feedback', 'q_responded', 'evt_q_responded', 'Responded prompt', $4::jsonb, NULL, NULL, 'responded', $7, $10, NULL, $11::jsonb, 'operator_a'),
  ($12, $13, $3, 'awaiting-feedback', 'q_other_parent', 'evt_q_other_parent', 'Other parent prompt', $4::jsonb, NULL, NULL, 'awaiting_response', $5, NULL, NULL, NULL, NULL)
`,
      [
        feedbackA.runId,
        parent.runId,
        SUCCESS_WORKFLOW_TYPE,
        JSON.stringify([
          { id: 1, label: 'Approve' },
          { id: 2, label: 'Reject' },
        ]),
        '2026-03-04T12:00:00.000Z',
        feedbackB.runId,
        '2026-03-04T11:00:00.000Z',
        '2026-03-04T11:10:00.000Z',
        feedbackC.runId,
        '2026-03-04T11:15:00.000Z',
        JSON.stringify({ questionId: 'q_responded', selectedOptionIds: [1] }),
        feedbackUnrelated.runId,
        unrelatedParent.runId,
      ],
    );

    const defaultResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/feedback-requests`,
    });

    expect(defaultResponse.statusCode).toBe(200);
    const defaultBody = defaultResponse.json<FeedbackListResponse>();
    expect(defaultBody.items.map((item) => item.feedbackRunId)).toEqual([
      feedbackA.runId,
      feedbackC.runId,
    ]);
    expect(defaultBody.items.every((item) => item.parentRunId === parent.runId)).toBe(true);
    expect(defaultBody.items.some((item) => item.status === 'cancelled')).toBe(false);

    const pageOneResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/feedback-requests?status=awaiting_response,responded,cancelled&limit=1`,
    });
    expect(pageOneResponse.statusCode).toBe(200);

    const pageOne = pageOneResponse.json<FeedbackListResponse>();
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.items[0]?.feedbackRunId).toBe(feedbackA.runId);
    expect(pageOne.nextCursor).toBeTruthy();

    const pageTwoResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/feedback-requests?status=awaiting_response,responded,cancelled&limit=1&cursor=${encodeURIComponent(pageOne.nextCursor as string)}`,
    });
    expect(pageTwoResponse.statusCode).toBe(200);

    const pageTwo = pageTwoResponse.json<FeedbackListResponse>();
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0]?.feedbackRunId).toBe(feedbackB.runId);

    const pageThreeResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/feedback-requests?status=awaiting_response,responded,cancelled&limit=1&cursor=${encodeURIComponent(pageTwo.nextCursor as string)}`,
    });
    expect(pageThreeResponse.statusCode).toBe(200);

    const pageThree = pageThreeResponse.json<FeedbackListResponse>();
    expect(pageThree.items).toHaveLength(1);
    expect(pageThree.items[0]?.feedbackRunId).toBe(feedbackC.runId);

    const emptyResponse = await harness.server.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/wr_does_not_exist/feedback-requests',
    });
    expect(emptyResponse.statusCode).toBe(200);
    expect(emptyResponse.json<FeedbackListResponse>()).toEqual({ items: [] });
  });
});
