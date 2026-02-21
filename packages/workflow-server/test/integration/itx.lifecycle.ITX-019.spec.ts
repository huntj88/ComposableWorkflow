import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import {
  countEventsForRun,
  createItxHarness,
  ITX_FAULT_CHECKPOINTS,
  listEventTypesForRun,
} from './setup.js';

describe('itx.lifecycle.ITX-019', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.019',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => {
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

  it('gates new starts until startup reconcile reaches readiness boundary', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const recoverableRun = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.019',
      input: { recover: true },
    });

    harness.controls.fault.inject(ITX_FAULT_CHECKPOINTS.beforeLockAcquire, {
      mode: 'once',
      action: 'barrier',
      barrierName: 'itx-019-startup-gate',
    });

    const pendingStart = harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.itx.019',
        input: { admitted: true },
      },
    });

    const gateCheck = await Promise.race([
      pendingStart.then(() => 'resolved'),
      new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 50)),
    ]);
    expect(gateCheck).toBe('waiting');

    await harness.controls.barrier.release('itx-019-startup-gate');

    const response = await pendingStart;
    expect(response.statusCode).toBe(201);

    const recoveredCount = await countEventsForRun(harness, {
      runId: recoverableRun.run.runId,
      eventType: 'workflow.recovered',
    });
    expect(recoveredCount).toBe(1);

    const recoveredEvents = await listEventTypesForRun(harness, recoverableRun.run.runId);
    expect(recoveredEvents).toContain('workflow.recovering');
    expect(recoveredEvents).toContain('workflow.recovered');
  });
});
