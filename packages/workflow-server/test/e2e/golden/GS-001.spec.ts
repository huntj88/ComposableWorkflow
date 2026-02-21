import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, listEvents, startWorkflow } from '../setup.js';

const GS001_PARENT = 'e2e.gs001.parent.v1';
const GS001_CHILD = 'e2e.gs001.child.v1';

describe('e2e.golden.GS-001', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS001_CHILD,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'done',
            states: {
              done: (ctx: WorkflowContext<unknown, unknown>) => ctx.complete({ child: 'ok' }),
            },
          }),
        });

        registry.register({
          workflowType: GS001_PARENT,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            transitions: [{ from: 'start', to: 'finish', name: 'done' }],
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'process.stdout.write("gs001")'],
                });
                await ctx.launchChild({ workflowType: GS001_CHILD, input: { child: true } });
                ctx.transition('finish');
              },
              finish: (ctx: WorkflowContext<unknown, unknown>) => ctx.complete({ ok: true }),
            },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('completes parent+child+command happy path with linked telemetry and tree', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const run = await startWorkflow({ harness, workflowType: GS001_PARENT, input: { gs: 1 } });
    await harness.orchestrator.resumeRun(run.runId);

    const summary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('completed');

    const events = await listEvents(harness, run.runId);
    expect(events.some((event) => event.eventType === 'command.completed')).toBe(true);
    expect(events.some((event) => event.eventType === 'child.completed')).toBe(true);

    const tree = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}/tree?includeCompletedChildren=true`,
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().tree.children.length).toBeGreaterThan(0);

    const snapshot = harness.diagnostics.snapshot(run.runId);
    expect(snapshot.logs.length).toBeGreaterThan(0);
    expect(snapshot.traces.length).toBeGreaterThan(0);
    expect(harness.diagnostics.snapshot().metrics.length).toBeGreaterThan(0);
  });
});
