import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('lifecycle recovery idempotence', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('reconcile is deterministic and idempotent for recoverable runs', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.recovery',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'active',
        states: {
          active: () => {
            return;
          },
        },
      }),
      packageName: 'test-package',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const pool = createPool({ connectionString: databaseUrl });
    const lockProvider = new InMemoryLockProvider();
    const orchestrator = createOrchestrator({
      pool,
      registry,
      lockProvider,
    });
    const reconcileService = createReconcileService({
      pool,
      lockProvider,
      orchestrator,
    });
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
    });

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.recovery',
        input: {},
      });

      await pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
        started.run.runId,
        'recovering',
      ]);

      const first = await reconcileService.reconcile({
        limit: 100,
        dryRun: false,
      });
      expect(first.recovered).toBe(1);

      const second = await reconcileService.reconcile({
        limit: 100,
        dryRun: false,
      });
      expect(second.recovered).toBe(0);

      const recoveredEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
        [started.run.runId],
      );
      expect(recoveredEvents.rows[0].count).toBe(1);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
