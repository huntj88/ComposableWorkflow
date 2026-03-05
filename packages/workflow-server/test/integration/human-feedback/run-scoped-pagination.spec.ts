import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  listRunFeedbackRequestsResponseSchema,
  type ListRunFeedbackRequestsResponse,
} from '@composable-workflow/workflow-api-types';

import { withTransaction } from '../../../src/persistence/db.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('integration.human-feedback.run-scoped-pagination', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  const createRun = async (params: {
    runId: string;
    workflowType: string;
    lifecycle?: 'running' | 'completed';
    parentRunId?: string | null;
    startedAt?: string;
    endedAt?: string | null;
  }): Promise<RunSummary> => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const runRepository = createRunRepository();

    return withTransaction(harness.db.pool, (client) =>
      runRepository.upsertRunSummary(client, {
        runId: params.runId,
        workflowType: params.workflowType,
        workflowVersion: '1.0.0',
        lifecycle: params.lifecycle ?? 'running',
        currentState: 'collect_feedback',
        parentRunId: params.parentRunId ?? null,
        startedAt: params.startedAt ?? '2026-03-05T00:00:00.000Z',
        endedAt: params.endedAt ?? null,
      }),
    );
  };

  const insertFeedbackRequest = async (params: {
    feedbackRunId: string;
    parentRunId: string;
    parentWorkflowType: string;
    questionId: string;
    status: 'awaiting_response' | 'responded' | 'cancelled';
    requestedAt: string;
    respondedAt?: string | null;
    cancelledAt?: string | null;
  }): Promise<void> => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

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
VALUES (
  $1,
  $2,
  $3,
  'awaiting-feedback',
  $4,
  $5,
  $6,
  $7::jsonb,
  NULL,
  NULL,
  $8,
  $9,
  $10,
  $11,
  $12::jsonb,
  $13
)
`,
      [
        params.feedbackRunId,
        params.parentRunId,
        params.parentWorkflowType,
        params.questionId,
        `evt_${params.feedbackRunId}`,
        `Prompt ${params.questionId}`,
        JSON.stringify([
          { id: 1, label: 'Approve' },
          { id: 2, label: 'Reject' },
        ]),
        params.status,
        params.requestedAt,
        params.respondedAt ?? null,
        params.cancelledAt ?? null,
        params.status === 'responded'
          ? JSON.stringify({
              questionId: params.questionId,
              selectedOptionIds: [1],
            })
          : null,
        params.status === 'responded' ? 'operator_itx_030' : null,
      ],
    );
  };

  const listForRun = async (params: {
    runId: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ListRunFeedbackRequestsResponse> => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const search = new URLSearchParams();
    if (params.status) {
      search.set('status', params.status);
    }
    if (typeof params.limit === 'number') {
      search.set('limit', String(params.limit));
    }
    if (params.cursor) {
      search.set('cursor', params.cursor);
    }

    const response = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${params.runId}/feedback-requests${search.size > 0 ? `?${search.toString()}` : ''}`,
    });

    expect(response.statusCode).toBe(200);
    return listRunFeedbackRequestsResponseSchema.parse(response.json());
  };

  it('ITX-030 enforces run scoping and stable cursor pagination under concurrent inserts', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const namespace = randomUUID().replace(/-/g, '').slice(0, 8);
    const parentWorkflowType = 'wf.test.parent';
    const parentRunId = `wr_itx030_parent_${namespace}`;
    const unrelatedParentRunId = `wr_itx030_other_parent_${namespace}`;

    await createRun({ runId: parentRunId, workflowType: parentWorkflowType });
    await createRun({ runId: unrelatedParentRunId, workflowType: parentWorkflowType });

    const feedbackIds = {
      newestAwaiting: `wr_itx030_a_01_${namespace}`,
      responded: `wr_itx030_a_02_${namespace}`,
      cancelled: `wr_itx030_a_03_${namespace}`,
      tieEarlierId: `wr_itx030_a_04_${namespace}`,
      tieLaterId: `wr_itx030_a_10_${namespace}`,
      unrelated: `wr_itx030_b_01_${namespace}`,
      insertedNewer: `wr_itx030_a_00_${namespace}`,
      insertedOlder: `wr_itx030_a_99_${namespace}`,
    } as const;

    for (const runId of Object.values(feedbackIds)) {
      await createRun({
        runId,
        workflowType: 'server.human-feedback.v1',
        parentRunId: runId === feedbackIds.unrelated ? unrelatedParentRunId : parentRunId,
      });
    }

    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.newestAwaiting,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_newest_awaiting',
      status: 'awaiting_response',
      requestedAt: '2026-03-05T12:05:00.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.responded,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_responded',
      status: 'responded',
      requestedAt: '2026-03-05T12:04:00.000Z',
      respondedAt: '2026-03-05T12:04:30.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.cancelled,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_cancelled',
      status: 'cancelled',
      requestedAt: '2026-03-05T12:03:00.000Z',
      cancelledAt: '2026-03-05T12:03:20.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.tieEarlierId,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_tie_1',
      status: 'awaiting_response',
      requestedAt: '2026-03-05T12:02:00.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.tieLaterId,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_tie_2',
      status: 'awaiting_response',
      requestedAt: '2026-03-05T12:02:00.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.unrelated,
      parentRunId: unrelatedParentRunId,
      parentWorkflowType,
      questionId: 'q_unrelated_parent',
      status: 'awaiting_response',
      requestedAt: '2026-03-05T12:06:00.000Z',
    });

    const pageOne = await listForRun({
      runId: parentRunId,
      status: 'awaiting_response,responded,cancelled',
      limit: 2,
    });
    expect(pageOne.items.map((item) => item.feedbackRunId)).toEqual([
      feedbackIds.newestAwaiting,
      feedbackIds.responded,
    ]);
    expect(pageOne.nextCursor).toBeTruthy();

    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.insertedNewer,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_inserted_newer',
      status: 'awaiting_response',
      requestedAt: '2026-03-05T12:06:30.000Z',
    });
    await insertFeedbackRequest({
      feedbackRunId: feedbackIds.insertedOlder,
      parentRunId,
      parentWorkflowType,
      questionId: 'q_inserted_older',
      status: 'responded',
      requestedAt: '2026-03-05T12:01:00.000Z',
      respondedAt: '2026-03-05T12:01:20.000Z',
    });

    const pageTwo = await listForRun({
      runId: parentRunId,
      status: 'awaiting_response,responded,cancelled',
      limit: 2,
      cursor: pageOne.nextCursor,
    });
    expect(pageTwo.items.map((item) => item.feedbackRunId)).toEqual([
      feedbackIds.cancelled,
      feedbackIds.tieEarlierId,
    ]);
    expect(pageTwo.nextCursor).toBeTruthy();

    const pageThree = await listForRun({
      runId: parentRunId,
      status: 'awaiting_response,responded,cancelled',
      limit: 2,
      cursor: pageTwo.nextCursor,
    });
    expect(pageThree.items.map((item) => item.feedbackRunId)).toEqual([
      feedbackIds.tieLaterId,
      feedbackIds.insertedOlder,
    ]);
    expect(pageThree.nextCursor).toBeUndefined();

    const pagedAfterCursor = [...pageTwo.items, ...pageThree.items].map(
      (item) => item.feedbackRunId,
    );
    expect(pagedAfterCursor).not.toContain(feedbackIds.insertedNewer);
    expect(
      [...pageOne.items, ...pageTwo.items, ...pageThree.items].every(
        (item) => item.parentRunId === parentRunId,
      ),
    ).toBe(true);
    expect(
      [...pageOne.items, ...pageTwo.items, ...pageThree.items].some(
        (item) => item.feedbackRunId === feedbackIds.unrelated,
      ),
    ).toBe(false);

    const defaultStatuses = await listForRun({ runId: parentRunId });
    expect(defaultStatuses.items.some((item) => item.status === 'cancelled')).toBe(false);
    expect(defaultStatuses.items.some((item) => item.feedbackRunId === feedbackIds.unrelated)).toBe(
      false,
    );

    const cancelledOnly = await listForRun({ runId: parentRunId, status: 'cancelled' });
    expect(cancelledOnly.items.map((item) => item.feedbackRunId)).toEqual([feedbackIds.cancelled]);

    const allStatuses = await listForRun({
      runId: parentRunId,
      status: 'awaiting_response,responded,cancelled',
      limit: 20,
    });
    const sortedIds = [...allStatuses.items]
      .sort((left, right) => {
        const byRequestedAt = right.requestedAt.localeCompare(left.requestedAt);
        if (byRequestedAt !== 0) {
          return byRequestedAt;
        }

        return left.feedbackRunId.localeCompare(right.feedbackRunId);
      })
      .map((item) => item.feedbackRunId);
    expect(allStatuses.items.map((item) => item.feedbackRunId)).toEqual(sortedIds);
  });
});
