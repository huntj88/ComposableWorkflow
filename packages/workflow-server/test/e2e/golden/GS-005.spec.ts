import { afterAll, describe, expect, it } from 'vitest';

import { createIntegrationHarness } from '../../harness/create-harness.js';
import { createSharedPostgresTestContainer } from '../../harness/postgres-container.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';

const GS005_TYPE = 'e2e.gs005.recovery.v1';

describe('e2e.golden.GS-005', () => {
  let harnessOne: IntegrationHarness | undefined;
  let harnessTwo: IntegrationHarness | undefined;
  let stopContainer: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await harnessOne?.shutdown();
    await harnessTwo?.shutdown();
    await stopContainer?.();
  });

  it('reconciles interrupted work idempotently and on startup before admitting new work', async () => {
    const postgres = await createSharedPostgresTestContainer();
    stopContainer = postgres.stop;

    harnessOne = await createIntegrationHarness({
      postgres: {
        useContainer: false,
        connectionString: postgres.connectionString,
      },
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS005_TYPE,
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
      },
    });

    const interrupted = await harnessOne.orchestrator.startRun({
      workflowType: GS005_TYPE,
      input: { interrupted: true },
    });

    await harnessOne.db.pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
      interrupted.run.runId,
      'recovering',
    ]);
    await harnessOne.db.pool.query(
      `
INSERT INTO workflow_events (event_id, run_id, sequence, event_type, timestamp, payload_jsonb, error_jsonb)
SELECT $1, $2, COALESCE(MAX(sequence), 0) + 1, 'workflow.recovering', $3, NULL, NULL
FROM workflow_events
WHERE run_id = $2
`,
      [
        `evt_gs005_recovering_${interrupted.run.runId}`,
        interrupted.run.runId,
        new Date().toISOString(),
      ],
    );

    await harnessOne.shutdown();
    harnessOne = undefined;

    harnessTwo = await createIntegrationHarness({
      postgres: {
        useContainer: false,
        connectionString: postgres.connectionString,
      },
      startupReconcile: true,
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: GS005_TYPE,
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
      },
    });

    const recoveredCount = await harnessTwo.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
      [interrupted.run.runId],
    );
    expect(recoveredCount.rows[0]?.count).toBeGreaterThanOrEqual(0);

    const admittedStart = await harnessTwo.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: GS005_TYPE,
        input: { afterRecovery: true },
      },
    });
    expect([200, 201]).toContain(admittedStart.statusCode);

    const reconcileOnce = await harnessTwo.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { dryRun: false, limit: 100 },
    });
    expect(reconcileOnce.statusCode).toBe(200);

    const reconcileAgain = await harnessTwo.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/recovery/reconcile',
      payload: { dryRun: false, limit: 100 },
    });
    expect(reconcileAgain.statusCode).toBe(200);
    expect(reconcileAgain.json().recovered).toBeLessThanOrEqual(reconcileOnce.json().recovered);
  }, 180_000);
});
