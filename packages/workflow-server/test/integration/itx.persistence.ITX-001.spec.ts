import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness, ITX_FAULT_CHECKPOINTS } from './setup.js';

describe('itx.persistence.ITX-001', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.001',
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

  it('preserves atomicity around ack boundary and avoids duplicate progression on retry', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    harness.controls.fault.inject(ITX_FAULT_CHECKPOINTS.afterEventAppendBeforeAck, 'once');

    await expect(
      harness.orchestrator.startRun({
        workflowType: 'wf.itx.001',
        idempotencyKey: 'itx-001-atomic',
        input: { purpose: 'ack-boundary' },
      }),
    ).rejects.toThrow(
      `Injected fault at checkpoint ${ITX_FAULT_CHECKPOINTS.afterEventAppendBeforeAck}`,
    );

    const retry = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.001',
      idempotencyKey: 'itx-001-atomic',
      input: { purpose: 'ack-boundary' },
    });

    expect(retry.created).toBe(true);

    const runCount = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE workflow_type = $1',
      ['wf.itx.001'],
    );
    expect(runCount.rows[0]?.count).toBe(1);

    const startedCount = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.started'",
      [retry.run.runId],
    );
    expect(startedCount.rows[0]?.count).toBe(1);

    const idempotencyCount = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_idempotency WHERE workflow_type = $1 AND idempotency_key = $2',
      ['wf.itx.001', 'itx-001-atomic'],
    );
    expect(idempotencyCount.rows[0]?.count).toBe(1);

    const triggered = harness.controls.fault.listTriggered().map((item) => item.name);
    expect(triggered).toContain(ITX_FAULT_CHECKPOINTS.afterEventAppendBeforeAck);
  });
});
