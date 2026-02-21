import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, listEvents, startWorkflow } from '../setup.js';

const GS004_PARENT = 'e2e.gs004.parent.v1';
const GS004_CHILD = 'e2e.gs004.child.v1';

describe('e2e.golden.GS-004', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS004_PARENT,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'active',
            states: { active: () => undefined },
          }),
        });

        registry.register({
          workflowType: GS004_CHILD,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'active',
            states: { active: () => undefined },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('propagates cancellation from parent to active descendants and terminalizes', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parent = await startWorkflow({ harness, workflowType: GS004_PARENT, input: {} });
    const child = await startWorkflow({ harness, workflowType: GS004_CHILD, input: {} });

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
        GS004_PARENT,
        GS004_CHILD,
        new Date().toISOString(),
        `evt_gs004_link_${parent.runId}`,
      ],
    );

    const cancel = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${parent.runId}/cancel`,
      payload: { requestedBy: 'gs-004', reason: 'cancel-propagation' },
    });
    expect(cancel.statusCode).toBe(200);

    await harness.orchestrator.resumeRun(parent.runId);
    await harness.orchestrator.resumeRun(child.runId);

    const parentEvents = await listEvents(harness, parent.runId);
    const childEvents = await listEvents(harness, child.runId);

    expect(parentEvents.some((event) => event.eventType === 'workflow.cancelled')).toBe(true);
    expect(childEvents.some((event) => event.eventType === 'workflow.cancelling')).toBe(true);
    expect(childEvents.some((event) => event.eventType === 'workflow.cancelled')).toBe(true);
  });
});
