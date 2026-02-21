import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  SUCCESS_WORKFLOW_TYPE,
  advanceRunToTerminal,
  createE2eHarness,
  listEvents,
  startWorkflow,
} from '../setup.js';

const readFirstStreamEvent = async (
  url: string,
): Promise<{ eventType: string; sequence: number }> => {
  const response = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      if (!frame.includes('event: workflow-event')) {
        continue;
      }

      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice('data: '.length);

      if (!dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine) as { eventType: string; sequence: number };
      await reader.cancel();
      return payload;
    }
  }

  throw new Error('No workflow-event frame received');
};

describe('e2e.behaviors.api-read', () => {
  let harness: IntegrationHarness | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    harness = await createE2eHarness();
    const address = await harness.server.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = address;
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-API-001..006 and B-DATA-002 expose consistent summaries, paged events, logs, list filters, definitions, and stream order', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: {
        requestId: 'api-001',
        customerId: 'cust-api',
        amountCents: 499,
        currency: 'USD',
      },
    });

    const streamPromise = readFirstStreamEvent(
      `${baseUrl}/api/v1/workflows/runs/${started.runId}/stream`,
    );

    await advanceRunToTerminal(harness, started.runId);

    const summaryResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}`,
    });
    expect(summaryResponse.statusCode).toBe(200);
    expect(['completed', 'failed', 'cancelled']).toContain(summaryResponse.json().lifecycle);

    const paged = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}/events?limit=2`,
    });
    expect(paged.statusCode).toBe(200);
    expect(paged.json().items.length).toBeLessThanOrEqual(2);

    const filtered = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}/events?eventType=workflow.completed&limit=20`,
    });
    expect(filtered.statusCode).toBe(200);
    expect(
      filtered
        .json()
        .items.every((item: { eventType: string }) => item.eventType === 'workflow.completed'),
    ).toBe(true);

    const logs = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}/logs`,
    });
    expect(logs.statusCode).toBe(200);

    const list = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs?workflowType=${encodeURIComponent(SUCCESS_WORKFLOW_TYPE)}`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((item: { runId: string }) => item.runId === started.runId)).toBe(
      true,
    );

    const definition = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/definitions/${encodeURIComponent(SUCCESS_WORKFLOW_TYPE)}`,
    });
    expect(definition.statusCode).toBe(200);
    expect(definition.json().states.length).toBeGreaterThan(0);

    const firstStreamEvent = await streamPromise;
    expect(firstStreamEvent.sequence).toBeGreaterThanOrEqual(1);

    const allEvents = await listEvents(harness, started.runId);
    const finalEvent = allEvents.at(-1);
    expect(finalEvent?.eventType.startsWith('workflow.')).toBe(true);
  });
});
