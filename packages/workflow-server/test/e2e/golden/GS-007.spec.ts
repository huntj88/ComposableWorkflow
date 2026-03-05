import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
  createE2eHarness,
  startWorkflow,
} from '../setup.js';

interface WorkflowEventDto {
  eventId: string;
  runId: string;
  sequence: number;
  eventType: string;
  timestamp: string;
  child: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: string;
  } | null;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const listAllEvents = async (
  harness: IntegrationHarness,
  runId: string,
): Promise<WorkflowEventDto[]> => {
  const items: WorkflowEventDto[] = [];
  let cursor: string | undefined;

  while (true) {
    const response = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}/events${
        cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=50` : '?limit=50'
      }`,
    });

    expect(response.statusCode).toBe(200);
    const page = response.json() as { items: WorkflowEventDto[]; nextCursor?: string };
    items.push(...page.items);

    if (!page.nextCursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return items;
};

describe('e2e.golden.GS-007', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('propagates cancellation from parent to feedback child and rejects post-cancel responses', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const requestId = `gs007-${Date.now()}`;
    const parent = await startWorkflow({
      harness,
      workflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
      input: {
        requestId,
        completionConfirmation: true,
      },
    });

    let feedbackRunId: string | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const link = await harness.db.pool.query<{ child_run_id: string }>(
        `
SELECT child_run_id
FROM workflow_run_children
WHERE parent_run_id = $1
  AND child_workflow_type = 'server.human-feedback.v1'
ORDER BY created_at DESC
LIMIT 1
`,
        [parent.runId],
      );

      if (link.rowCount === 1) {
        feedbackRunId = link.rows[0]?.child_run_id;
        break;
      }

      await sleep(100);
    }

    expect(feedbackRunId).toBeTruthy();

    const projectionBefore = await harness.db.pool.query<{
      question_id: string;
      status: 'awaiting_response' | 'responded' | 'cancelled';
    }>('SELECT question_id, status FROM human_feedback_requests WHERE feedback_run_id = $1', [
      feedbackRunId,
    ]);
    expect(projectionBefore.rowCount).toBe(1);
    expect(projectionBefore.rows[0]?.status).toBe('awaiting_response');

    const cancelResponse = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${parent.runId}/cancel`,
      payload: {
        requestedBy: 'gs-007',
        reason: 'parent-cancel-propagation',
      },
    });
    expect(cancelResponse.statusCode).toBe(200);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await harness.orchestrator.resumeRun(parent.runId);
      await harness.orchestrator.resumeRun(feedbackRunId as string);

      const states = await harness.db.pool.query<{
        run_id: string;
        lifecycle: string;
      }>('SELECT run_id, lifecycle FROM workflow_runs WHERE run_id = ANY($1::text[])', [
        [parent.runId, feedbackRunId],
      ]);

      const parentLifecycle = states.rows.find((row) => row.run_id === parent.runId)?.lifecycle;
      const childLifecycle = states.rows.find((row) => row.run_id === feedbackRunId)?.lifecycle;
      if (parentLifecycle === 'cancelled' && childLifecycle === 'cancelled') {
        break;
      }

      await sleep(100);
    }

    const parentSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}`,
    });
    expect(parentSummary.statusCode).toBe(200);
    expect(parentSummary.json().lifecycle).toBe('cancelled');

    const childSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${feedbackRunId}`,
    });
    expect(childSummary.statusCode).toBe(200);
    expect(childSummary.json().lifecycle).toBe('cancelled');

    const projectionAfter = await harness.db.pool.query<{
      question_id: string;
      status: 'awaiting_response' | 'responded' | 'cancelled';
      cancelled_at: Date | null;
    }>(
      'SELECT question_id, status, cancelled_at FROM human_feedback_requests WHERE feedback_run_id = $1',
      [feedbackRunId],
    );
    expect(projectionAfter.rowCount).toBe(1);
    expect(projectionAfter.rows[0]?.status).toBe('cancelled');
    expect(projectionAfter.rows[0]?.cancelled_at).not.toBeNull();

    const feedbackStatus = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}`,
    });
    expect(feedbackStatus.statusCode).toBe(200);
    expect(feedbackStatus.json().status).toBe('cancelled');

    const rejectPostCancelResponse = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId: projectionAfter.rows[0]?.question_id,
          selectedOptionIds: [1],
        },
        respondedBy: 'gs007_post_cancel',
      },
    });
    expect(rejectPostCancelResponse.statusCode).toBe(409);
    expect(rejectPostCancelResponse.json().status).toBe('cancelled');

    const parentEvents = await listAllEvents(harness, parent.runId);
    const childEvents = await listAllEvents(harness, feedbackRunId as string);

    expect(parentEvents.some((event) => event.eventType === 'workflow.cancelled')).toBe(true);
    expect(
      parentEvents.some(
        (event) =>
          event.eventType === 'child.started' &&
          event.child?.childRunId === feedbackRunId &&
          event.child?.childWorkflowType === 'server.human-feedback.v1',
      ),
    ).toBe(true);
    expect(childEvents.some((event) => event.eventType === 'human-feedback.cancelled')).toBe(true);
    expect(childEvents.some((event) => event.eventType === 'workflow.cancelled')).toBe(true);

    const treeResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/tree?includeCompletedChildren=true`,
    });
    expect(treeResponse.statusCode).toBe(200);
    const tree = treeResponse.json() as {
      tree: {
        lifecycle: string;
        children: Array<{ runId: string; lifecycle: string }>;
      };
    };

    expect(tree.tree.lifecycle).toBe('cancelled');
    const childNode = tree.tree.children.find((node) => node.runId === feedbackRunId);
    expect(childNode?.lifecycle).toBe('cancelled');
  });
});
