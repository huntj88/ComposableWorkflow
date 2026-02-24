import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness, listEventTypesForRun } from '../setup.js';

const IMMEDIATE_START_TYPE = 'wf.start.immediate.itx';
const IMMEDIATE_PARENT_TYPE = 'wf.start.immediate.parent.itx';
const IMMEDIATE_CHILD_TYPE = 'wf.start.immediate.child.itx';

const waitFor = async (
  assertion: () => Promise<void>,
  timeoutMs = 5_000,
  intervalMs = 50,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
  }

  throw lastError ?? new Error('Condition did not pass before timeout');
};

describe('integration.orchestrator.start-immediate-execution', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: IMMEDIATE_START_TYPE,
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: (ctx: WorkflowContext<unknown, unknown>) => {
                ctx.transition('done');
              },
              done: (ctx: WorkflowContext<unknown, unknown>) => {
                ctx.complete({ ok: true });
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

  it('starts in running and executes immediately without explicit resume', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await harness.orchestrator.startRun({
      workflowType: IMMEDIATE_START_TYPE,
      input: { requestId: 'immediate-execution' },
    });

    expect(started.created).toBe(true);
    expect(started.run.lifecycle).toBe('running');
    expect(started.startedEvent?.eventType).toBe('workflow.started');

    await waitFor(async () => {
      const lifecycleResult = await harness?.db.pool.query<{ lifecycle: string }>(
        'SELECT lifecycle FROM workflow_runs WHERE run_id = $1',
        [started.run.runId],
      );
      const lifecycle = lifecycleResult?.rows[0]?.lifecycle;
      expect(['completed', 'failed', 'cancelled']).toContain(lifecycle);
    });

    const eventTypes = await listEventTypesForRun(harness, started.run.runId);
    expect(eventTypes[0]).toBe('workflow.started');
    expect(eventTypes).toContain('workflow.completed');

    const pendingLifecycles = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE run_id = $1 AND lifecycle = $2',
      [started.run.runId, 'pending'],
    );
    expect(pendingLifecycles.rows[0]?.count).toBe(0);
  });

  it('preserves parent-child linkage and child event ordering under immediate start handoff', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    harness.registry.register({
      workflowType: IMMEDIATE_PARENT_TYPE,
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx: WorkflowContext<unknown, unknown>) => {
            await ctx.launchChild({ workflowType: IMMEDIATE_CHILD_TYPE, input: { child: true } });
            ctx.complete({ parent: true });
          },
        },
      }),
      packageName: 'itx-tests',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: 'test',
    });

    harness.registry.register({
      workflowType: IMMEDIATE_CHILD_TYPE,
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'child-start',
        states: {
          'child-start': (ctx: WorkflowContext<unknown, unknown>) => {
            ctx.complete({ child: true });
          },
        },
      }),
      packageName: 'itx-tests',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: 'test',
    });

    const parentStarted = await harness.orchestrator.startRun({
      workflowType: IMMEDIATE_PARENT_TYPE,
      input: { parent: true },
    });

    await waitFor(async () => {
      const parentLifecycle = await harness?.db.pool.query<{ lifecycle: string }>(
        'SELECT lifecycle FROM workflow_runs WHERE run_id = $1',
        [parentStarted.run.runId],
      );
      expect(parentLifecycle?.rows[0]?.lifecycle).toBe('completed');
    });

    const childLinks = await harness.db.pool.query<{ child_run_id: string }>(
      'SELECT child_run_id FROM workflow_run_children WHERE parent_run_id = $1',
      [parentStarted.run.runId],
    );

    expect(childLinks.rowCount).toBe(1);
    const childRunId = childLinks.rows[0]?.child_run_id;
    expect(childRunId).toBeTruthy();

    const parentEvents = await listEventTypesForRun(harness, parentStarted.run.runId);
    expect(parentEvents[0]).toBe('workflow.started');
    expect(parentEvents).toContain('child.started');
    expect(parentEvents).toContain('child.completed');

    const childEvents = await listEventTypesForRun(harness, childRunId as string);
    expect(childEvents[0]).toBe('workflow.started');
    expect(childEvents).toContain('workflow.completed');
  });
});
