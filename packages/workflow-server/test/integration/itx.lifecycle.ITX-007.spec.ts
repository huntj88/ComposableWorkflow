import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTransaction } from '../../src/persistence/db.js';
import type { IntegrationHarness } from '../harness/create-harness.js';
import {
  countEventsForRun,
  createItxHarness,
  hasEventSequence,
  listEventTypesForRun,
} from './setup.js';

const appendRecoveringEvent = async (harness: IntegrationHarness, runId: string): Promise<void> => {
  await withTransaction(harness.db.pool, async (client) => {
    await client.query(
      `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
SELECT
  $1,
  $2,
  COALESCE(MAX(sequence), 0) + 1,
  'workflow.recovering',
  $3,
  NULL,
  NULL
FROM workflow_events
WHERE run_id = $2
`,
      [`evt_itx_007_${runId}`, runId, new Date().toISOString()],
    );
  });
};

describe('itx.lifecycle.ITX-007', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.007',
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
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('reconciles idempotently across partial progress and restart-like retry', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const runOne = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.007',
      input: { branch: 1 },
    });
    const runTwo = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.007',
      input: { branch: 2 },
    });

    await harness.orchestrator.resumeRun(runOne.run.runId);
    await harness.orchestrator.resumeRun(runTwo.run.runId);

    await harness.db.pool.query(
      'UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = ANY($1::text[])',
      [[runOne.run.runId, runTwo.run.runId], 'recovering'],
    );
    await appendRecoveringEvent(harness, runOne.run.runId);
    await appendRecoveringEvent(harness, runTwo.run.runId);

    harness.controls.fault.inject('orchestration.before.resumeRun', 'once');

    const firstReconcile = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { limit: 100, dryRun: false },
    });
    expect(firstReconcile.statusCode).toBe(200);

    const secondReconcile = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { limit: 100, dryRun: false },
    });
    expect(secondReconcile.statusCode).toBe(200);

    const thirdReconcile = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { limit: 100, dryRun: false },
    });
    expect(thirdReconcile.statusCode).toBe(200);
    expect(thirdReconcile.json().recovered).toBe(0);

    for (const runId of [runOne.run.runId, runTwo.run.runId]) {
      const recoveredCount = await countEventsForRun(harness, {
        runId,
        eventType: 'workflow.recovered',
      });
      expect(recoveredCount).toBe(1);

      const eventTypes = await listEventTypesForRun(harness, runId);
      expect(hasEventSequence(eventTypes, ['workflow.recovering', 'workflow.recovered'])).toBe(
        true,
      );
    }
  });
});
