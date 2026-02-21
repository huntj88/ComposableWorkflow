import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIntegrationHarness, type IntegrationHarness } from '../../harness/create-harness.js';

describe('ITX-001 deterministic fault window', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createIntegrationHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.001',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: (ctx) => {
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

  it('reproduces crash window deterministically at persistence boundary', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    harness.controls.fault.inject('persistence.after.upsertRunSummary', 'once');

    await expect(
      harness.orchestrator.startRun({
        workflowType: 'wf.itx.001',
        input: { test: 'fault-window' },
      }),
    ).rejects.toThrow('Injected fault at checkpoint persistence.after.upsertRunSummary');

    const runRows = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE workflow_type = $1',
      ['wf.itx.001'],
    );
    expect(runRows.rows[0].count).toBe(0);

    const diagnostics = harness.diagnostics.snapshot();
    expect(
      diagnostics.faults.some((item) => item.name === 'persistence.after.upsertRunSummary'),
    ).toBe(true);
  });
});
