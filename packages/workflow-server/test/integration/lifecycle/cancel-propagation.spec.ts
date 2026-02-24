import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('lifecycle cancel propagation', () => {
  let container: StartedTestContainer | undefined;
  let databaseUrl: string;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'workflow',
          POSTGRES_USER: 'workflow',
          POSTGRES_PASSWORD: 'workflow',
        })
        .withExposedPorts(5432)
        .start();

      databaseUrl = `postgresql://workflow:workflow@${container.getHost()}:${container.getMappedPort(5432)}/workflow`;
      await runMigrations({ databaseUrl, direction: 'up' });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('requests cancellation for active descendants when parent is cancelled', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.cancel-parent',
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

    registry.register({
      workflowType: 'wf.lifecycle.cancel-child',
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
    const startupReconcile = createStartupReconcileController(reconcileService);
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
      startupReconcile,
    });

    try {
      const parent = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.cancel-parent',
        input: {},
      });
      const child = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.cancel-child',
        input: {},
        parentRunId: parent.run.runId,
      });

      await pool.query(
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
VALUES ($1, $2, $3, $4, $5, $6, $7)
`,
        [
          parent.run.runId,
          child.run.runId,
          'wf.lifecycle.cancel-parent',
          'wf.lifecycle.cancel-child',
          'active',
          new Date().toISOString(),
          `evt_link_${parent.run.runId}`,
        ],
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/workflows/runs/${parent.run.runId}/cancel`,
        payload: {
          reason: 'operator-request',
          requestedBy: 'test-suite',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().lifecycle).toBe('cancelling');

      const childLifecycle = await pool.query<{ lifecycle: string }>(
        'SELECT lifecycle FROM workflow_runs WHERE run_id = $1',
        [child.run.runId],
      );
      expect(['cancelling', 'cancelled']).toContain(childLifecycle.rows[0].lifecycle);

      const childCancellingEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.cancelling'",
        [child.run.runId],
      );
      expect(childCancellingEvents.rows[0].count).toBe(1);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
