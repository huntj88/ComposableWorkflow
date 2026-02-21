import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createE2eHarness, SUCCESS_WORKFLOW_TYPE } from '../e2e/setup.js';

const describeIfBlackbox =
  process.env.WORKFLOW_BLACKBOX_REQUIRED === 'true' ? describe : describe.skip;

interface RunSummary {
  runId: string;
  lifecycle: string;
  currentState: string;
}

interface EventPage {
  items: Array<{ eventType: string; sequence: number }>;
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

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}: ${body}`);
  }

  return body ? (JSON.parse(body) as T) : ({} as T);
};

const isTerminal = (lifecycle: string): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

const waitForProductionTerminal = async (runId: string): Promise<RunSummary> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const summary = await requestJson<RunSummary>(`/api/v1/workflows/runs/${runId}`);
    if (isTerminal(summary.lifecycle)) {
      return summary;
    }

    const reconcileResponse = await fetch(
      `${resolveBaseUrl()}/api/v1/workflows/recovery/reconcile`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          limit: 100,
        }),
      },
    );

    if (reconcileResponse.status !== 200) {
      const errorBody = await reconcileResponse.text();
      throw new Error(
        `Request failed (${reconcileResponse.status}) for /api/v1/workflows/recovery/reconcile: ${errorBody}`,
      );
    }
  }

  throw new Error(`Run ${runId} did not reach terminal lifecycle within retry budget`);
};

const listProductionEvents = async (runId: string): Promise<string[]> => {
  const allEventTypes: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=100` : '?limit=100';
    const page = await requestJson<EventPage>(`/api/v1/workflows/runs/${runId}/events${query}`);
    allEventTypes.push(...page.items.map((item) => item.eventType));

    if (!page.nextCursor) {
      return allEventTypes;
    }

    cursor = page.nextCursor;
  }
};

describeIfBlackbox('e2e.blackbox.workflow-parity', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('produces equivalent terminal lifecycle and event sequence in harness vs launched production modes', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const fixtureInput = {
      requestId: `parity-${randomUUID()}`,
      customerId: 'cust-parity',
      amountCents: 1450,
      currency: 'USD',
    };

    const productionStarted = await requestJson<{ runId: string }>('/api/v1/workflows/start', {
      method: 'POST',
      body: JSON.stringify({
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input: fixtureInput,
        idempotencyKey: `prod-${fixtureInput.requestId}`,
      }),
    });

    const harnessStartResponse = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input: fixtureInput,
        idempotencyKey: `harness-${fixtureInput.requestId}`,
      },
    });
    expect([200, 201]).toContain(harnessStartResponse.statusCode);
    const harnessStarted = harnessStartResponse.json() as { runId: string };

    const productionTerminal = await waitForProductionTerminal(productionStarted.runId);

    let harnessTerminal = harnessStartResponse.json() as RunSummary;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      harnessTerminal = (
        await harness.server.inject({
          method: 'GET',
          url: `/api/v1/workflows/runs/${harnessStarted.runId}`,
        })
      ).json() as RunSummary;

      if (isTerminal(harnessTerminal.lifecycle)) {
        break;
      }

      const reconcileResponse = await harness.server.inject({
        method: 'POST',
        url: '/api/v1/workflows/recovery/reconcile',
        payload: {
          limit: 100,
        },
      });
      expect(reconcileResponse.statusCode).toBe(200);
    }

    expect(isTerminal(harnessTerminal.lifecycle)).toBe(true);

    const productionEvents = await listProductionEvents(productionStarted.runId);
    const harnessEventsResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${harnessStarted.runId}/events?limit=200`,
    });
    expect(harnessEventsResponse.statusCode).toBe(200);
    const harnessEvents = (harnessEventsResponse.json() as EventPage).items.map(
      (item) => item.eventType,
    );

    expect(productionTerminal.lifecycle).toBe(harnessTerminal.lifecycle);
    expect(productionTerminal.currentState).toBe(harnessTerminal.currentState);
    expect(productionEvents).toEqual(harnessEvents);
  });
});
