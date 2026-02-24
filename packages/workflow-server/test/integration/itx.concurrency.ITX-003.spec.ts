import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createDeferred, createItxHarness, ITX_FAULT_CHECKPOINTS } from './setup.js';

describe('itx.concurrency.ITX-003', () => {
  let harness: IntegrationHarness | undefined;
  let enteredState = createDeferred<void>();
  let continueState = createDeferred<void>();

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.003',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: { transition: (to: string) => void }) => {
                enteredState.resolve();
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

  it('allows only one active runner lock holder per run', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    enteredState = createDeferred<void>();
    continueState = createDeferred<void>();

    harness.controls.fault.inject(ITX_FAULT_CHECKPOINTS.beforeLockAcquire, {
      mode: 'always',
      action: 'barrier',
      barrierName: 'itx-003-lock-gate',
    });
    harness.controls.fault.inject(ITX_FAULT_CHECKPOINTS.afterLockAcquire, {
      mode: 'always',
      action: 'barrier',
      barrierName: 'itx-003-after-lock-gate',
    });

    await harness.controls.barrier.release('itx-003-after-lock-gate');

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.003',
      input: { race: true },
    });

    const runnerOne = harness.orchestrator.resumeRun(started.run.runId);
    const runnerTwo = harness.orchestrator.resumeRun(started.run.runId);

    await harness.controls.barrier.release('itx-003-lock-gate');
    await enteredState.promise;

    continueState.resolve();
    await Promise.all([runnerOne, runnerTwo]);

    const counts = await harness.db.pool.query<{ event_type: string; count: number }>(
      `
SELECT event_type, COUNT(*)::int AS count
FROM workflow_events
WHERE run_id = $1
  AND event_type IN ('transition.completed', 'workflow.completed')
GROUP BY event_type
`,
      [started.run.runId],
    );

    const byType = new Map(counts.rows.map((row) => [row.event_type, row.count]));
    expect(byType.get('transition.completed') ?? 0).toBe(1);
    expect(byType.get('workflow.completed') ?? 0).toBe(1);

    const triggered = harness.controls.fault.listTriggered();
    expect(
      triggered.filter((item) => item.name === ITX_FAULT_CHECKPOINTS.beforeLockAcquire).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      triggered.filter((item) => item.name === ITX_FAULT_CHECKPOINTS.afterLockAcquire).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
