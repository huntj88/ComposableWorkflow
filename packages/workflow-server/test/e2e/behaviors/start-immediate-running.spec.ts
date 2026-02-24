import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, getRunSummary, listEvents, startWorkflow } from '../setup.js';

const IMMEDIATE_RUNNING_TYPE = 'e2e.start.immediate-running.v1';

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

const waitForTerminal = async (
  harness: IntegrationHarness,
  runId: string,
  maxIterations = 50,
): Promise<void> => {
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const summary = await getRunSummary(harness, runId);
    if (['completed', 'failed', 'cancelled'].includes(summary.lifecycle)) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Run ${runId} did not reach terminal lifecycle in time`);
};

describe('e2e.behaviors.start-immediate-running', () => {
  let harness: IntegrationHarness | undefined;
  let entered = createDeferred<void>();
  let release = createDeferred<void>();

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: IMMEDIATE_RUNNING_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
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

  it('returns running on accepted start and emits workflow.started at execution start', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    entered = createDeferred<void>();
    release = createDeferred<void>();

    const started = await startWorkflow({
      harness,
      workflowType: IMMEDIATE_RUNNING_TYPE,
      input: { requestId: 'start-immediate-running' },
    });

    expect(started.lifecycle).toBe('running');
    await entered.promise;

    const events = await listEvents(harness, started.runId);
    expect(events[0]?.eventType).toBe('workflow.started');

    release.resolve();
    await waitForTerminal(harness, started.runId);
  });
});
