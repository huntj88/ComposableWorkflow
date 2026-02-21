import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, listEvents, startWorkflow } from '../setup.js';

const PAUSEABLE_TYPE = 'e2e.lifecycle.pauseable.v1';
const CHILD_GATED_TYPE = 'e2e.lifecycle.child-gated.v1';
const CHILD_TARGET_TYPE = 'e2e.lifecycle.child-target.v1';

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
};

describe('e2e.behaviors.lifecycle', () => {
  let harness: IntegrationHarness | undefined;
  let entered = createDeferred<void>();
  let release = createDeferred<void>();

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: PAUSEABLE_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'running',
            states: {
              running: async (ctx: WorkflowContext<unknown, unknown>) => {
                entered.resolve();
                await release.promise;
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: CHILD_GATED_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'gate',
            states: {
              gate: async (ctx: WorkflowContext<unknown, unknown>) => {
                entered.resolve();
                await release.promise;
                await ctx.launchChild({ workflowType: CHILD_TARGET_TYPE, input: {} });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: CHILD_TARGET_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'done',
            states: {
              done: (ctx: WorkflowContext<unknown, unknown>) => ctx.complete({ ok: true }),
            },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-LIFE-001..004 pauses/resumes only from valid lifecycles and returns 409 otherwise', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    entered = createDeferred<void>();
    release = createDeferred<void>();

    const run = await startWorkflow({ harness, workflowType: PAUSEABLE_TYPE, input: {} });
    const resumePromise = harness.orchestrator.resumeRun(run.runId);
    await entered.promise;

    const pause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/pause`,
      payload: { requestedBy: 'e2e-life', reason: 'pause-now' },
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().lifecycle).toBe('pausing');

    release.resolve();
    await resumePromise;

    const pausedSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}`,
    });
    expect(pausedSummary.statusCode).toBe(200);
    expect(['paused', 'completed']).toContain(pausedSummary.json().lifecycle);

    const invalidPause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/pause`,
      payload: { requestedBy: 'e2e-life', reason: 'invalid-pause' },
    });
    expect(invalidPause.statusCode).toBe(409);

    const resume = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/resume`,
      payload: { requestedBy: 'e2e-life', reason: 'resume-now' },
    });
    expect([200, 409]).toContain(resume.statusCode);
    if (resume.statusCode === 200) {
      expect(resume.json().lifecycle).toBe('resuming');
    }

    const invalidResume = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/resume`,
      payload: { requestedBy: 'e2e-life', reason: 'invalid-resume' },
    });
    expect(invalidResume.statusCode).toBe(409);
  });

  it('B-LIFE-005/006/007 prevents child launch during pausing, propagates cancellation, and reconciles idempotently', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    entered = createDeferred<void>();
    release = createDeferred<void>();

    const run = await startWorkflow({ harness, workflowType: CHILD_GATED_TYPE, input: {} });
    const inFlight = harness.orchestrator.resumeRun(run.runId);
    await entered.promise;

    const pause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/pause`,
      payload: { requestedBy: 'e2e-life', reason: 'prevent-child-launch' },
    });
    expect(pause.statusCode).toBe(200);

    release.resolve();
    await inFlight;

    const pausedEvents = await listEvents(harness, run.runId);
    expect(pausedEvents.some((event) => event.eventType === 'child.started')).toBe(false);

    const cancel = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${run.runId}/cancel`,
      payload: { requestedBy: 'e2e-life', reason: 'cancel-paused' },
    });
    expect(cancel.statusCode).toBe(200);

    await harness.orchestrator.resumeRun(run.runId);

    const reconcileOne = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { dryRun: false, limit: 100 },
    });
    expect(reconcileOne.statusCode).toBe(200);

    const reconcileTwo = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { dryRun: false, limit: 100 },
    });
    expect(reconcileTwo.statusCode).toBe(200);
    expect(reconcileTwo.json().recovered).toBeLessThanOrEqual(reconcileOne.json().recovered);
  });
});
