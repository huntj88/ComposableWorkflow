import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import { createIntegrationHarness } from '../../harness/create-harness.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';

describe('run summary transition context', () => {
  let harness: IntegrationHarness | undefined;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      harness = await createIntegrationHarness({
        registerWorkflows: (registry) => {
          registry.register({
            workflowType: 'wf.transition.context.v1',
            workflowVersion: '1.0.0',
            factory: () => ({
              initialState: 'start',
              transitions: [{ from: 'start', to: 'next', name: 'move-next' }],
              states: {
                start: (ctx: WorkflowContext<unknown, unknown>) => {
                  ctx.transition('next', {
                    requestId: 'ctx-1',
                  });
                },
                next: () => {
                  return;
                },
              },
            }),
            packageName: 'test-package',
            packageVersion: '1.0.0',
            source: 'path',
            sourceValue: '.',
          });
        },
      });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('populates currentTransitionContext from persisted transition events', async (context) => {
    if (!runtimeAvailable || !harness) {
      context.skip();
      return;
    }

    const integrationHarness = harness;

    const startResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.transition.context.v1',
        input: {},
      },
    });
    expect(startResponse.statusCode).toBe(201);

    const runId = startResponse.json().runId as string;

    await integrationHarness.orchestrator.resumeRun(runId);

    const summaryResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}`,
    });

    expect(summaryResponse.statusCode).toBe(200);
    const summary = summaryResponse.json() as {
      currentTransitionContext: Record<string, unknown> | null;
    };

    expect(summary.currentTransitionContext).not.toBeNull();
    expect(summary.currentTransitionContext).toMatchObject({
      from: 'start',
      to: 'next',
      name: 'move-next',
      data: {
        requestId: 'ctx-1',
      },
    });
  });
});
