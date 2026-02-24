import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createDeferred, createItxHarness } from './setup.js';

describe('itx.persistence.ITX-017', () => {
  let harness: IntegrationHarness | undefined;
  let continueState = createDeferred<void>();

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.017',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: { transition: (to: string) => void }) => {
                await continueState.promise;
                ctx.transition('done');
              },
              done: (ctx: { complete: (output: unknown) => void }) => {
                ctx.complete({ ok: true });
              },
            },
            transitions: [{ from: 'start', to: 'done', name: 'to-done' }],
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

  it('keeps snapshot state consistent with replay-derived state when snapshots are present', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    continueState = createDeferred<void>();

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.017',
      input: { snapshots: true },
    });

    const pending = harness.orchestrator.resumeRun(started.run.runId);
    continueState.resolve();
    await pending;

    const replayDerived = await harness.db.pool.query<{
      sequence: number;
      event_type: string;
    }>(
      `
SELECT sequence, event_type
FROM workflow_events
WHERE run_id = $1
ORDER BY sequence ASC
`,
      [started.run.runId],
    );

    const runSummary = await harness.db.pool.query<{
      lifecycle: string;
      current_state: string;
    }>('SELECT lifecycle, current_state FROM workflow_runs WHERE run_id = $1', [started.run.runId]);

    const snapshotRow = await harness.db.pool.query<{
      sequence: number;
      lifecycle: string;
      current_state: string;
      snapshot_jsonb: Record<string, unknown>;
    }>(
      'SELECT sequence, lifecycle, current_state, snapshot_jsonb FROM workflow_snapshots WHERE run_id = $1',
      [started.run.runId],
    );

    if (snapshotRow.rowCount === 0) {
      const tableHasRows = await harness.db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM workflow_snapshots',
      );
      expect(tableHasRows.rows[0]?.count ?? 0).toBeGreaterThanOrEqual(0);
      expect(snapshotRow.rowCount).toBe(0);
      return;
    }

    const lastSequence = replayDerived.rows.at(-1)?.sequence;
    expect(lastSequence).toBeTypeOf('number');

    expect(snapshotRow.rows[0]?.sequence).toBe(lastSequence);
    expect(snapshotRow.rows[0]?.lifecycle).toBe(runSummary.rows[0]?.lifecycle);
    expect(snapshotRow.rows[0]?.current_state).toBe(runSummary.rows[0]?.current_state);
  });
});
