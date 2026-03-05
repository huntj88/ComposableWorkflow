import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
  advanceRunToTerminal,
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

interface FeedbackRequestItem {
  feedbackRunId: string;
  parentRunId: string;
  questionId: string;
  status: 'awaiting_response' | 'responded' | 'cancelled';
}

interface RunTreeNode {
  runId: string;
  workflowType: string;
  lifecycle: string;
  children: RunTreeNode[];
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

const findTreeNode = (root: RunTreeNode, runId: string): RunTreeNode | undefined => {
  if (root.runId === runId) {
    return root;
  }

  for (const child of root.children) {
    const match = findTreeNode(child, runId);
    if (match) {
      return match;
    }
  }

  return undefined;
};

describe('e2e.golden.GS-006', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('executes full human feedback request-response round trip with linkage and conflict semantics', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const requestId = `gs006-${Date.now()}`;
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

    const childSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${feedbackRunId}`,
    });
    expect(childSummary.statusCode).toBe(200);
    expect(childSummary.json().lifecycle).toBe('running');

    const initialProjection = await harness.db.pool.query<{
      parent_run_id: string;
      question_id: string;
      status: 'awaiting_response' | 'responded' | 'cancelled';
    }>(
      'SELECT parent_run_id, question_id, status FROM human_feedback_requests WHERE feedback_run_id = $1',
      [feedbackRunId],
    );
    expect(initialProjection.rowCount).toBe(1);
    expect(initialProjection.rows[0]?.parent_run_id).toBe(parent.runId);
    expect(initialProjection.rows[0]?.status).toBe('awaiting_response');

    const runScopedList = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/feedback-requests`,
    });
    expect(runScopedList.statusCode).toBe(200);
    const listBody = runScopedList.json() as { items: FeedbackRequestItem[] };
    expect(
      listBody.items.some(
        (item) =>
          item.feedbackRunId === feedbackRunId &&
          item.parentRunId === parent.runId &&
          item.status === 'awaiting_response',
      ),
    ).toBe(true);

    const questionId = initialProjection.rows[0]?.question_id as string;

    const invalidOption = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId,
          selectedOptionIds: [999],
        },
        respondedBy: 'gs006_invalid',
      },
    });
    expect(invalidOption.statusCode).toBe(400);

    const accepted = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId,
          selectedOptionIds: [1],
          text: 'gs006 accepted',
        },
        respondedBy: 'gs006_operator',
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');

    const duplicate = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId,
          selectedOptionIds: [2],
        },
        respondedBy: 'gs006_duplicate',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().status).toBe('responded');

    const feedbackStatus = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}`,
    });
    expect(feedbackStatus.statusCode).toBe(200);
    expect(feedbackStatus.json().status).toBe('responded');

    const respondedProjection = await harness.db.pool.query<{
      status: 'awaiting_response' | 'responded' | 'cancelled';
      responded_at: Date | null;
      cancelled_at: Date | null;
      responded_by: string | null;
    }>(
      'SELECT status, responded_at, cancelled_at, responded_by FROM human_feedback_requests WHERE feedback_run_id = $1',
      [feedbackRunId],
    );
    expect(respondedProjection.rows[0]?.status).toBe('responded');
    expect(respondedProjection.rows[0]?.responded_at).not.toBeNull();
    expect(respondedProjection.rows[0]?.cancelled_at).toBeNull();
    expect(respondedProjection.rows[0]?.responded_by).toBe('gs006_operator');

    const parentTerminal = await advanceRunToTerminal(harness, parent.runId);
    expect(parentTerminal.lifecycle).toBe('completed');

    const feedbackSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${feedbackRunId}`,
    });
    expect(feedbackSummary.statusCode).toBe(200);
    expect(feedbackSummary.json().lifecycle).toBe('completed');

    const parentEvents = await listAllEvents(harness, parent.runId);
    const feedbackEvents = await listAllEvents(harness, feedbackRunId as string);

    expect(
      parentEvents.some(
        (event) =>
          event.eventType === 'child.started' &&
          event.child?.childRunId === feedbackRunId &&
          event.child.childWorkflowType === 'server.human-feedback.v1',
      ),
    ).toBe(true);
    expect(
      parentEvents.some(
        (event) =>
          event.eventType === 'child.completed' &&
          event.child?.childRunId === feedbackRunId &&
          event.child.childWorkflowType === 'server.human-feedback.v1',
      ),
    ).toBe(true);
    expect(feedbackEvents.some((event) => event.eventType === 'human-feedback.requested')).toBe(
      true,
    );
    expect(feedbackEvents.some((event) => event.eventType === 'human-feedback.received')).toBe(
      true,
    );

    const treeResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parent.runId}/tree?includeCompletedChildren=true`,
    });
    expect(treeResponse.statusCode).toBe(200);

    const tree = treeResponse.json() as { tree: RunTreeNode };
    const feedbackNode = findTreeNode(tree.tree, feedbackRunId as string);
    expect(feedbackNode?.workflowType).toBe('server.human-feedback.v1');
    expect(feedbackNode?.lifecycle).toBe('completed');
  });
});
