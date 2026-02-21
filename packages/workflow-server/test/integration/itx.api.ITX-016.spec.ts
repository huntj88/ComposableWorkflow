import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTransaction } from '../../src/persistence/db.js';
import { createEventRepository } from '../../src/persistence/event-repository.js';
import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.api.ITX-016', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.016',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: () => {
                return;
              },
            },
          }),
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('keeps cursor pagination stable under concurrent appends', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const activeHarness = harness;

    const started = await activeHarness.orchestrator.startRun({
      workflowType: 'wf.itx.016',
      input: { paging: true },
    });

    const eventRepository = createEventRepository();

    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        withTransaction(activeHarness.db.pool, async (client) => {
          await eventRepository.appendEvent(client, {
            eventId: `itx-016-pre-${index + 1}`,
            runId: started.run.runId,
            eventType: index % 2 === 0 ? 'log' : 'transition.completed',
            timestamp: new Date(1_770_000_200_000 + index).toISOString(),
            payload: {
              index,
            },
          });
        }),
      ),
    );

    const firstPage = await activeHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.run.runId}/events?limit=10`,
    });

    expect(firstPage.statusCode).toBe(200);
    const firstBody = firstPage.json() as {
      items: Array<{ sequence: number; eventType: string }>;
      nextCursor?: string;
    };
    expect(firstBody.items).toHaveLength(10);
    expect(firstBody.nextCursor).toBeTruthy();

    await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        withTransaction(activeHarness.db.pool, async (client) => {
          await eventRepository.appendEvent(client, {
            eventId: `itx-016-tail-${index + 1}`,
            runId: started.run.runId,
            eventType: 'log',
            timestamp: new Date(1_770_000_210_000 + index).toISOString(),
            payload: {
              index: 100 + index,
            },
          });
        }),
      ),
    );

    const seenSequences = [...firstBody.items.map((item) => item.sequence)];

    let cursor = firstBody.nextCursor;
    while (cursor) {
      const page = await activeHarness.server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/events?limit=10&cursor=${encodeURIComponent(cursor)}`,
      });
      expect(page.statusCode).toBe(200);

      const body = page.json() as {
        items: Array<{ sequence: number; eventType: string }>;
        nextCursor?: string;
      };
      seenSequences.push(...body.items.map((item) => item.sequence));
      cursor = body.nextCursor;
    }

    expect(new Set(seenSequences).size).toBe(seenSequences.length);

    const sorted = [...seenSequences].sort((left, right) => left - right);
    expect(seenSequences).toEqual(sorted);
    expect(sorted[0]).toBe(1);
    expect(sorted.at(-1)).toBe(32);

    const filtered = await activeHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.run.runId}/events?eventType=log&limit=200`,
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json() as {
      items: Array<{ eventType: string; sequence: number }>;
    };
    expect(filteredBody.items.every((item) => item.eventType === 'log')).toBe(true);
  });
});
