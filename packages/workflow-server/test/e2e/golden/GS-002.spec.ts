import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, listEvents, startWorkflow } from '../setup.js';

const GS002_PARENT = 'e2e.gs002.parent.v1';
const GS002_CHILD = 'e2e.gs002.child.v1';

describe('e2e.golden.GS-002', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS002_CHILD,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'boom',
            states: {
              boom: (ctx: WorkflowContext<unknown, unknown>) =>
                ctx.fail(new Error('GS-002 child deterministic failure')),
            },
          }),
        });

        registry.register({
          workflowType: GS002_PARENT,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.launchChild({ workflowType: GS002_CHILD, input: {} });
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

  it('propagates child failure and parent failure by default policy', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const run = await startWorkflow({ harness, workflowType: GS002_PARENT, input: { gs: 2 } });
    await harness.orchestrator.resumeRun(run.runId);

    const parentSummary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}`,
    });
    expect(parentSummary.statusCode).toBe(200);
    expect(parentSummary.json().lifecycle).toBe('failed');

    const parentEvents = await listEvents(harness, run.runId);
    expect(parentEvents.some((event) => event.eventType === 'child.failed')).toBe(true);
    expect(parentEvents.some((event) => event.eventType === 'workflow.failed')).toBe(true);

    const tree = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}/tree?includeCompletedChildren=true`,
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().tree.lifecycle).toBe('failed');
  });
});
