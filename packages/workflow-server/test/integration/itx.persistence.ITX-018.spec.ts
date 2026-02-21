import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.persistence.ITX-018', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.018.child',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: (ctx: { complete: (output: unknown) => void }) => {
                ctx.complete({ child: true });
              },
            },
          }),
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });

        registry.register({
          workflowType: 'wf.itx.018.parent',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: {
                launchChild: (request: unknown) => Promise<unknown>;
                complete: (output: unknown) => void;
              }) => {
                const child = await ctx.launchChild({
                  workflowType: 'wf.itx.018.child',
                  input: { from: 'parent' },
                  idempotencyKey: 'itx-018-child-key',
                });
                ctx.complete({ child });
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

  it('writes child linkage transactionally with lineage event and stays duplicate-safe across retry', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    harness.controls.fault.inject('orchestration.after.resumeRun', 'once');

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.018.parent',
      input: { value: 1 },
    });

    await expect(harness.orchestrator.resumeRun(started.run.runId)).rejects.toThrow(
      'Injected fault at checkpoint orchestration.after.resumeRun',
    );

    await harness.orchestrator.resumeRun(started.run.runId);

    const childLinkRows = await harness.db.pool.query<{
      child_run_id: string;
      linked_by_event_id: string;
    }>(
      'SELECT child_run_id, linked_by_event_id FROM workflow_run_children WHERE parent_run_id = $1',
      [started.run.runId],
    );
    expect(childLinkRows.rowCount).toBe(1);

    const childRunId = childLinkRows.rows[0]?.child_run_id;
    expect(childRunId).toBeTypeOf('string');

    const parentChildStartedEvents = await harness.db.pool.query<{
      event_id: string;
      payload_jsonb: Record<string, unknown> | null;
    }>(
      `
SELECT event_id, payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'child.started'
ORDER BY sequence ASC
`,
      [started.run.runId],
    );

    expect(parentChildStartedEvents.rowCount).toBe(1);
    expect(parentChildStartedEvents.rows[0]?.event_id).toBe(
      childLinkRows.rows[0]?.linked_by_event_id,
    );

    const childRunRows = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE run_id = $1 AND parent_run_id = $2',
      [childRunId, started.run.runId],
    );
    expect(childRunRows.rows[0]?.count).toBe(1);

    const duplicatedLinks = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_run_children WHERE parent_run_id = $1 AND child_run_id = $2',
      [started.run.runId, childRunId],
    );
    expect(duplicatedLinks.rows[0]?.count).toBe(1);
  });
});
