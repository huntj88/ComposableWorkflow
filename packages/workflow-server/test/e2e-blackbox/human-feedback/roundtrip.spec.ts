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

describe('e2e.blackbox.human-feedback.roundtrip', () => {
  it('supports human feedback status + respond roundtrip with strict first-wins conflicts', async () => {
    const requestId = `blackbox-feedback-${randomUUID()}`;

    const startedResponse = await request('/api/v1/workflows/start', {
      method: 'POST',
      body: JSON.stringify({
        workflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
        input: {
          requestId,
          completionConfirmation: true,
        },
        idempotencyKey: `blackbox-feedback-idempotency-${requestId}`,
      }),
    });

    if (startedResponse.status === 404) {
      const payload = (await startedResponse.json()) as { code?: string };
      if (payload.code === 'WORKFLOW_TYPE_NOT_FOUND') {
        return;
      }
    }

    if (!startedResponse.ok) {
      throw new Error(`Request failed (${startedResponse.status}) for /api/v1/workflows/start`);
    }

    const started = (await startedResponse.json()) as { runId: string };

    const feedbackRunId = await findFeedbackChildRunId(started.runId);

    const initialStatus = await requestJson<{
      status: string;
      questionId: string;
    }>(`/api/v1/human-feedback/requests/${feedbackRunId}`);
    expect(initialStatus.status).toBe('awaiting_response');

    const accepted = await requestJson<{
      status: string;
      acceptedAt: string;
    }>(`/api/v1/human-feedback/requests/${feedbackRunId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        response: {
          questionId: initialStatus.questionId,
          selectedOptionIds: [1],
          text: 'approved in blackbox test',
        },
        respondedBy: 'blackbox_operator',
      }),
    });

    expect(accepted.status).toBe('accepted');
    expect(typeof accepted.acceptedAt).toBe('string');

    const conflictResponse = await request(
      `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({
          response: {
            questionId: initialStatus.questionId,
            selectedOptionIds: [2],
          },
          respondedBy: 'blackbox_operator_conflict',
        }),
      },
    );

    expect(conflictResponse.status).toBe(409);
    const conflict = (await conflictResponse.json()) as {
      feedbackRunId: string;
      status: string;
      respondedAt?: string | null;
    };
    expect(conflict.feedbackRunId).toBe(feedbackRunId);
    expect(conflict.status).toBe('responded');
    expect(conflict.respondedAt).toBeTruthy();

    const finalStatus = await requestJson<{
      status: string;
      response: {
        questionId: string;
        selectedOptionIds?: number[];
      } | null;
      respondedBy: string | null;
    }>(`/api/v1/human-feedback/requests/${feedbackRunId}`);

    expect(finalStatus.status).toBe('responded');
    expect(finalStatus.response?.questionId).toBe(initialStatus.questionId);
    expect(finalStatus.response?.selectedOptionIds).toEqual([1]);
    expect(finalStatus.respondedBy).toBe('blackbox_operator');
  });
});
