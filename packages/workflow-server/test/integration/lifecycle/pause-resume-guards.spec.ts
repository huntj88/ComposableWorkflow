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
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('lifecycle pause/resume guards', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('accepts valid pause/resume and rejects invalid states with 409', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.guards',
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
      const started = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.guards',
        input: {},
      });

      const paused = await server.inject({
        method: 'POST',
        url: `/api/v1/workflows/runs/${started.run.runId}/pause`,
        payload: {
          reason: 'operator-request',
          requestedBy: 'test-suite',
        },
      });
      expect(paused.statusCode).toBe(200);
      expect(paused.json().lifecycle).toBe('pausing');

      const duplicatePause = await server.inject({
        method: 'POST',
        url: `/api/v1/workflows/runs/${started.run.runId}/pause`,
        payload: {
          reason: 'operator-request',
          requestedBy: 'test-suite',
        },
      });
      expect(duplicatePause.statusCode).toBe(409);
      expect(duplicatePause.json().details).toEqual({
        code: 'INVALID_LIFECYCLE',
        currentLifecycle: 'paused',
      });

      const [resumeA, resumeB] = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/api/v1/workflows/runs/${started.run.runId}/resume`,
          payload: {
            reason: 'operator-request',
            requestedBy: 'test-suite',
          },
        }),
        server.inject({
          method: 'POST',
          url: `/api/v1/workflows/runs/${started.run.runId}/resume`,
          payload: {
            reason: 'operator-request',
            requestedBy: 'test-suite',
          },
        }),
      ]);

      const statusCodes = [resumeA.statusCode, resumeB.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);

      const finalSummary = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}`,
      });
      expect(finalSummary.statusCode).toBe(200);
      expect(finalSummary.json().lifecycle).toBe('running');
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
