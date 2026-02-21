import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, expectFourDimensions, listEvents, startWorkflow } from '../setup.js';

const EVT_PARENT_TYPE = 'e2e.events.parent.v1';
const EVT_CHILD_TYPE = 'e2e.events.child.v1';

describe('e2e.behaviors.events-integrity', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: EVT_PARENT_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => undefined,
            },
          }),
        });
        registry.register({
          workflowType: EVT_CHILD_TYPE,
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

  it('B-EVT-001/002/003 preserves event envelope, sequence invariants, and parent-child lineage', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await startWorkflow({ harness, workflowType: EVT_PARENT_TYPE, input: {} });
    const child = await startWorkflow({ harness, workflowType: EVT_CHILD_TYPE, input: {} });

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
        EVT_PARENT_TYPE,
        EVT_CHILD_TYPE,
        new Date().toISOString(),
        `evt_events_link_${started.runId}`,
      ],
    );

    const parentEvents = await listEvents(harness, started.runId);
    expect(parentEvents.length).toBeGreaterThan(0);
    const eventIds = new Set(parentEvents.map((event) => event.eventId));
    expect(eventIds.size).toBe(parentEvents.length);

    for (const event of parentEvents) {
      expect(event.runId).toBeTruthy();
      expect(event.eventType).toBeTruthy();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    }

    const childLink = await harness.db.pool.query<{ child_run_id: string }>(
      'SELECT child_run_id FROM workflow_run_children WHERE parent_run_id = $1 ORDER BY created_at ASC LIMIT 1',
      [started.runId],
    );
    expect(childLink.rowCount).toBe(1);

    const childRunId = childLink.rows[0]?.child_run_id as string;
    const childEvents = await listEvents(harness, childRunId);
    expect(childEvents.length).toBeGreaterThan(0);

    const tree = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.runId}/tree?includeCompletedChildren=true`,
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().tree.children.length).toBeGreaterThan(0);

    await expectFourDimensions({
      harness,
      runId: started.runId,
    });
  });
});
