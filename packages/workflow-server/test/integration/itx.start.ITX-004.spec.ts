import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.start.ITX-004', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.004',
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

  it('deduplicates concurrent start race for identical idempotency key', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const activeHarness = harness;

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        activeHarness.orchestrator.startRun({
          workflowType: 'wf.itx.004',
          idempotencyKey: 'itx-004-idem-key',
          input: { race: true },
        }),
      ),
    );

    const runIds = new Set(responses.map((result) => result.run.runId));
    expect(runIds.size).toBe(1);
    expect(responses.filter((result) => result.created).length).toBe(1);

    const persistedRuns = await activeHarness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE workflow_type = $1',
      ['wf.itx.004'],
    );
    expect(persistedRuns.rows[0]?.count).toBe(1);

    const startedEvents = await activeHarness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.started'",
      [responses[0]?.run.runId],
    );
    expect(startedEvents.rows[0]?.count).toBe(1);
  });
});
