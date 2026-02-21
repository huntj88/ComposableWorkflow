import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTransaction } from '../../src/persistence/db.js';
import { createEventRepository } from '../../src/persistence/event-repository.js';
import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.concurrency.ITX-002', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.002',
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

  it('keeps per-run sequence monotonic and gap-free under concurrent writers', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const activeHarness = harness;

    const started = await activeHarness.orchestrator.startRun({
      workflowType: 'wf.itx.002',
      input: { race: true },
    });

    const eventRepository = createEventRepository();
    const concurrentWrites = 64;

    await Promise.all(
      Array.from({ length: concurrentWrites }, (_, index) =>
        withTransaction(activeHarness.db.pool, async (client) => {
          await eventRepository.appendEvent(client, {
            eventId: `itx-002-evt-${index + 1}`,
            runId: started.run.runId,
            eventType: 'log',
            timestamp: new Date(1_770_000_100_000 + index).toISOString(),
            payload: { index },
          });
        }),
      ),
    );

    const sequenceRows = await activeHarness.db.pool.query<{ sequence: number }>(
      'SELECT sequence FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC',
      [started.run.runId],
    );

    const actual = sequenceRows.rows.map((row) => row.sequence);
    const expected = Array.from({ length: concurrentWrites + 1 }, (_, index) => index + 1);

    expect(actual).toEqual(expected);
  });
});
