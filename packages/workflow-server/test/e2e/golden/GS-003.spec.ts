import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, listEvents, startWorkflow } from '../setup.js';

const GS003_TYPE = 'e2e.gs003.pause-resume.v1';

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('e2e.golden.GS-003', () => {
  let harness: IntegrationHarness | undefined;
  let entered = createDeferred<void>();
  let release = createDeferred<void>();

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS003_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'work',
            states: {
              work: async (ctx: WorkflowContext<unknown, unknown>) => {
                entered.resolve();
                await release.promise;
                ctx.complete({ ok: true });
              },
            },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('pauses, verifies invalid lifecycle 409s, resumes, and completes', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    entered = createDeferred<void>();
    release = createDeferred<void>();

    const run = await startWorkflow({ harness, workflowType: GS003_TYPE, input: { gs: 3 } });
    const firstResume = harness.orchestrator.resumeRun(run.runId);

    await entered.promise;

    const pause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/pause`,
      payload: { requestedBy: 'gs-003', reason: 'pause-mid-flight' },
    });
    expect(pause.statusCode).toBe(200);

    release.resolve();
    await firstResume;

    const invalidPause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/pause`,
      payload: { requestedBy: 'gs-003', reason: 'invalid-pause' },
    });
    expect(invalidPause.statusCode).toBe(409);

    const resume = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/resume`,
      payload: { requestedBy: 'gs-003', reason: 'resume' },
    });
    expect([200, 409]).toContain(resume.statusCode);

    await harness.orchestrator.resumeRun(run.runId);

    const summary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('completed');

    const events = await listEvents(harness, run.runId);
    expect(events.some((event) => event.eventType === 'workflow.pausing')).toBe(true);
  });
});
