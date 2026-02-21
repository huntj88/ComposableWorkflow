import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, expectFourDimensions, listEvents, startWorkflow } from '../setup.js';

const TRANSITION_OK = 'e2e.transitions.ok.v1';
const TRANSITION_FAIL = 'e2e.transitions.fail.v1';

describe('e2e.behaviors.transitions', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: TRANSITION_OK,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            transitions: [{ from: 'start', to: 'done', name: 'to-done' }],
            states: {
              start: (ctx: WorkflowContext<unknown, unknown>) => ctx.transition('done'),
              done: (ctx: WorkflowContext<unknown, unknown>) => ctx.complete({ ok: true }),
            },
          }),
        });

        registry.register({
          workflowType: TRANSITION_FAIL,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: (ctx: WorkflowContext<unknown, unknown>) => ctx.transition('missing-state'),
            },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-TRANS-001/003 and B-DATA-001 preserve ordered append-only transitions under concurrent runs', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const activeHarness = harness;

    const runs = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        startWorkflow({
          harness: activeHarness,
          workflowType: TRANSITION_OK,
          input: { index },
          idempotencyKey: `trans-${index}`,
        }),
      ),
    );

    await Promise.all(runs.map((run) => activeHarness.orchestrator.resumeRun(run.runId)));

    for (const run of runs) {
      const events = await listEvents(activeHarness, run.runId);
      const types = events.map((event) => event.eventType);
      expect(types).toContain('transition.requested');
      expect(types).toContain('transition.completed');
      expect(types.indexOf('transition.requested')).toBeLessThan(
        types.indexOf('transition.completed'),
      );

      await expectFourDimensions({
        harness: activeHarness,
        runId: run.runId,
        expectedLifecycle: 'completed',
      });
    }
  });

  it('B-TRANS-002/004 emits transition.failed and terminalizes failed run', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await startWorkflow({
      harness,
      workflowType: TRANSITION_FAIL,
      input: { fail: true },
    });

    await harness.orchestrator.resumeRun(started.runId);

    const events = await listEvents(harness, started.runId);
    expect(events.some((event) => event.eventType === 'transition.failed')).toBe(true);

    const summary = await expectFourDimensions({
      harness,
      runId: started.runId,
      expectedLifecycle: 'failed',
    });
    expect(summary.summary.currentState).toBe('missing-state');
  });
});
