import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

const appendEvent = async (params: {
  harness: IntegrationHarness;
  runId: string;
  eventType: 'workflow.recovered' | 'transition.completed';
  payload?: Record<string, unknown>;
}): Promise<void> => {
  await params.harness.db.pool.query(
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
  $2,
  $1,
  COALESCE(MAX(sequence), 0) + 1,
  $3,
  NOW(),
  $4::jsonb,
  NULL
FROM workflow_events
WHERE run_id = $1
`,
    [
      params.runId,
      `evt_recovery_progress_${randomUUID()}`,
      params.eventType,
      JSON.stringify(params.payload ?? {}),
    ],
  );
};

describe('lifecycle recovery progress gating', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.lifecycle.recovery.progress-gating',
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

  it('skips reconcile when no transition progress occurred after latest recovery boundary', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.lifecycle.recovery.progress-gating',
      input: { scenario: 'skip' },
    });

    await appendEvent({
      harness,
      runId: started.run.runId,
      eventType: 'workflow.recovered',
    });

    const reconcile = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { limit: 100, dryRun: false },
    });

    expect(reconcile.statusCode).toBe(200);
    expect(reconcile.json()).toMatchObject({
      scanned: 1,
      recovered: 0,
      skipped: 1,
      failed: 0,
    });

    const recoveringEvents = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovering'",
      [started.run.runId],
    );
    expect(recoveringEvents.rows[0]?.count ?? 0).toBe(0);
  });

  it('recovers again when transition progress occurred after latest recovery boundary', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.lifecycle.recovery.progress-gating',
      input: { scenario: 'recover' },
    });

    await appendEvent({
      harness,
      runId: started.run.runId,
      eventType: 'workflow.recovered',
    });
    await appendEvent({
      harness,
      runId: started.run.runId,
      eventType: 'transition.completed',
      payload: {
        from: 'active',
        to: 'active',
        name: 'synthetic-progress-after-recovery',
      },
    });

    const reconcile = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { limit: 100, dryRun: false },
    });

    expect(reconcile.statusCode).toBe(200);
    expect(reconcile.json()).toMatchObject({
      recovered: 1,
      failed: 0,
    });

    const recoveredEvents = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
      [started.run.runId],
    );
    expect(recoveredEvents.rows[0]?.count ?? 0).toBe(2);
  });
});
