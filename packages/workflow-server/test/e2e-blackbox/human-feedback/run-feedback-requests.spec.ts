import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE } from '../../e2e/setup.js';

interface WorkflowEvent {
  eventType: string;
  child: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: string;
  } | null;
}

interface EventPage {
  items: WorkflowEvent[];
  nextCursor?: string;
}

interface FeedbackListResponse {
  items: Array<{
    feedbackRunId: string;
    parentRunId: string;
    status: 'awaiting_response' | 'responded' | 'cancelled';
  }>;
  nextCursor?: string;
}

const resolveBaseUrl = (): string => {
  if (process.env.WORKFLOW_BLACKBOX_BASE_URL) {
    return process.env.WORKFLOW_BLACKBOX_BASE_URL;
  }

  if (process.env.WORKFLOW_API_BASE_URL) {
    return process.env.WORKFLOW_API_BASE_URL;
  }

  const port = process.env.WORKFLOW_SERVER_PORT ?? '3000';
  return `http://127.0.0.1:${port}`;
};

const request = async (path: string, init?: RequestInit): Promise<Response> =>
  fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await request(path, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}: ${body}`);
  }

  return body ? (JSON.parse(body) as T) : ({} as T);
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const findFeedbackChildRunId = async (parentRunId: string): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const page = await requestJson<EventPage>(
      `/api/v1/workflows/runs/${parentRunId}/events?limit=200`,
    );

    const childStart = page.items.find(
      (item) =>
        item.eventType === 'child.started' &&
        item.child?.childWorkflowType === 'server.human-feedback.v1' &&
        typeof item.child.childRunId === 'string',
    );

    if (childStart?.child?.childRunId) {
      return childStart.child.childRunId;
    }

    await sleep(100);
  }

  throw new Error(`Unable to resolve feedback child run for parent ${parentRunId}`);
};

describe('e2e.blackbox.human-feedback.run-feedback-requests', () => {
  it('lists run-scoped feedback requests without leaking unrelated run requests', async () => {
    const requestIdA = `blackbox-run-feedback-a-${randomUUID()}`;
    const requestIdB = `blackbox-run-feedback-b-${randomUUID()}`;

    const startAResponse = await request('/api/v1/workflows/start', {
      method: 'POST',
      body: JSON.stringify({
        workflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
        input: {
          requestId: requestIdA,
          completionConfirmation: true,
        },
        idempotencyKey: `blackbox-run-feedback-idem-a-${requestIdA}`,
      }),
    });

    if (startAResponse.status === 404) {
      const payload = (await startAResponse.json()) as { code?: string };
      if (payload.code === 'WORKFLOW_TYPE_NOT_FOUND') {
        return;
      }
    }

    if (!startAResponse.ok) {
      throw new Error(`Request failed (${startAResponse.status}) for /api/v1/workflows/start`);
    }

    const startBResponse = await request('/api/v1/workflows/start', {
      method: 'POST',
      body: JSON.stringify({
        workflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
        input: {
          requestId: requestIdB,
          completionConfirmation: true,
        },
        idempotencyKey: `blackbox-run-feedback-idem-b-${requestIdB}`,
      }),
    });

    if (!startBResponse.ok) {
      throw new Error(`Request failed (${startBResponse.status}) for /api/v1/workflows/start`);
    }

    const startedA = (await startAResponse.json()) as { runId: string };
    const startedB = (await startBResponse.json()) as { runId: string };

    const feedbackRunA = await findFeedbackChildRunId(startedA.runId);
    const feedbackRunB = await findFeedbackChildRunId(startedB.runId);

    const scoped = await requestJson<FeedbackListResponse>(
      `/api/v1/workflows/runs/${startedA.runId}/feedback-requests`,
    );

    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every((item) => item.parentRunId === startedA.runId)).toBe(true);
    expect(scoped.items.some((item) => item.feedbackRunId === feedbackRunA)).toBe(true);
    expect(scoped.items.some((item) => item.feedbackRunId === feedbackRunB)).toBe(false);

    const missingRun = await requestJson<FeedbackListResponse>(
      '/api/v1/workflows/runs/wr_non_existent_blackbox/feedback-requests',
    );
    expect(missingRun).toEqual({ items: [] });
  });
});
