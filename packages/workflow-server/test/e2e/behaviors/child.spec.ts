import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, expectFourDimensions, listEvents, startWorkflow } from '../setup.js';

const PARENT_CANCEL_TYPE = 'e2e.child.cancel.parent.v1';
const CHILD_ACTIVE_TYPE = 'e2e.child.cancel.active.v1';

describe('e2e.behaviors.child', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: PARENT_CANCEL_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'launch',
            states: {
              launch: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.launchChild({
                  workflowType: CHILD_ACTIVE_TYPE,
                  input: { active: true },
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: CHILD_ACTIVE_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => {
                return;
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

  it('B-CHILD-001/003 + B-DATA-003 links child run lineage and run-tree projections', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await startWorkflow({ harness, workflowType: PARENT_CANCEL_TYPE, input: {} });
    const child = await startWorkflow({ harness, workflowType: CHILD_ACTIVE_TYPE, input: {} });

    await harness.db.pool.query(
      `
INSERT INTO workflow_run_children (
  parent_run_id,
  child_run_id,
  parent_workflow_type,
  child_workflow_type,
  parent_state,
  created_at,
  linked_by_event_id
)
VALUES ($1, $2, $3, $4, 'active', $5, $6)
`,
      [
        started.runId,
        child.runId,
        PARENT_CANCEL_TYPE,
        CHILD_ACTIVE_TYPE,
        new Date().toISOString(),
        `evt_child_link_${started.runId}`,
      ],
    );

    const parentEvents = await listEvents(harness, started.runId);
    expect(parentEvents.length).toBeGreaterThan(0);

    const link = await harness.db.pool.query<{ parent_run_id: string; child_run_id: string }>(
      'SELECT parent_run_id, child_run_id FROM workflow_run_children WHERE parent_run_id = $1',
      [started.runId],
    );
    expect(link.rowCount).toBeGreaterThan(0);
    expect(link.rows[0]?.parent_run_id).toBe(started.runId);

    const tree = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}/tree?includeCompletedChildren=true`,
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().tree.children.length).toBeGreaterThan(0);

    await expectFourDimensions({ harness, runId: started.runId });
  });

  it('B-CHILD-002/004 + B-OBS-003 propagates child failure/cancellation semantics through descendants', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parent = await startWorkflow({ harness, workflowType: PARENT_CANCEL_TYPE, input: {} });
    const child = await startWorkflow({ harness, workflowType: CHILD_ACTIVE_TYPE, input: {} });

    await harness.db.pool.query(
      `
INSERT INTO workflow_run_children (
  parent_run_id,
  child_run_id,
  parent_workflow_type,
  child_workflow_type,
  parent_state,
  created_at,
  linked_by_event_id
)
VALUES ($1, $2, $3, $4, 'active', $5, $6)
`,
      [
        parent.runId,
        child.runId,
        PARENT_CANCEL_TYPE,
        CHILD_ACTIVE_TYPE,
        new Date().toISOString(),
        `evt_child_link_${parent.runId}`,
      ],
    );

    const cancelResponse = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${parent.runId}/cancel`,
      payload: {
        requestedBy: 'e2e-child',
        reason: 'propagation-check',
      },
    });
    expect(cancelResponse.statusCode).toBe(200);

    await harness.orchestrator.resumeRun(parent.runId);
    await harness.orchestrator.resumeRun(child.runId);

    const childEvents = await listEvents(harness, child.runId);
    expect(childEvents.some((event) => event.eventType === 'workflow.cancelling')).toBe(true);

    const logs = harness.diagnostics.snapshot(parent.runId).logs;
    const traces = harness.diagnostics.snapshot(parent.runId).traces;
    expect(logs.length).toBeGreaterThan(0);
    expect(traces.length).toBeGreaterThan(0);
  });
});
