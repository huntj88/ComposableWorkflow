import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import {
  countEventsForRun,
  createItxHarness,
  hasEventSequence,
  listEventTypesForRun,
} from './setup.js';

describe('itx.lifecycle.ITX-008', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.008.parent',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => {
                return;
              },
            },
          }),
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });

        registry.register({
          workflowType: 'wf.itx.008.child-active',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => {
                return;
              },
            },
          }),
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });

        registry.register({
          workflowType: 'wf.itx.008.child-terminal',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'done',
            states: {
              done: (ctx: { complete: (output: unknown) => void }) => {
                ctx.complete({ terminal: true });
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

  it('propagates cancellation through active descendants exactly once and skips terminal nodes', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parent = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.008.parent',
      input: {},
    });
    const activeChild = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.008.child-active',
      input: {},
    });
    const terminalChild = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.008.child-terminal',
      input: {},
    });
    const activeGrandchild = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.008.child-active',
      input: {},
    });

    await harness.orchestrator.resumeRun(terminalChild.run.runId);

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
VALUES
  ($1, $2, $3, $4, $5, $6, $7),
  ($1, $8, $3, $9, $5, $6, $10),
  ($2, $11, $4, $4, $5, $6, $12)
`,
      [
        parent.run.runId,
        activeChild.run.runId,
        'wf.itx.008.parent',
        'wf.itx.008.child-active',
        'active',
        new Date().toISOString(),
        `evt_link_${parent.run.runId}_1`,
        terminalChild.run.runId,
        'wf.itx.008.child-terminal',
        `evt_link_${parent.run.runId}_2`,
        activeGrandchild.run.runId,
        `evt_link_${activeChild.run.runId}_1`,
      ],
    );

    const firstCancel = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${parent.run.runId}/cancel`,
      payload: {
        requestedBy: 'itx-008',
        reason: 'propagation-check',
      },
    });
    expect(firstCancel.statusCode).toBe(200);

    const secondCancel = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${parent.run.runId}/cancel`,
      payload: {
        requestedBy: 'itx-008',
        reason: 'duplicate-cancel',
      },
    });
    expect(secondCancel.statusCode).toBe(409);

    const activeChildCancelling = await countEventsForRun(harness, {
      runId: activeChild.run.runId,
      eventType: 'workflow.cancelling',
    });
    const activeGrandchildCancelling = await countEventsForRun(harness, {
      runId: activeGrandchild.run.runId,
      eventType: 'workflow.cancelling',
    });
    const terminalChildCancelling = await countEventsForRun(harness, {
      runId: terminalChild.run.runId,
      eventType: 'workflow.cancelling',
    });
    expect(activeChildCancelling).toBe(1);
    expect(activeGrandchildCancelling).toBe(1);
    expect(terminalChildCancelling).toBe(0);

    const parentEvents = await listEventTypesForRun(harness, parent.run.runId);
    expect(hasEventSequence(parentEvents, ['workflow.cancelling', 'workflow.cancelled'])).toBe(
      true,
    );
  });
});
