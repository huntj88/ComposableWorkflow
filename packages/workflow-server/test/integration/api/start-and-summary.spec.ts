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

describe('api start and summary', () => {
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

  it('supports start, summary, tree, list, and definitions contracts', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.api.simple',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            return;
          },
        },
        transitions: [{ from: 'start', to: 'done', name: 'complete' }],
      }),
      metadata: {
        displayName: 'Simple API Workflow',
      },
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

    const unknownStart = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.missing',
        input: {},
      },
    });
    expect(unknownStart.statusCode).toBe(404);

    try {
      const startResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/start',
        payload: {
          workflowType: 'wf.api.simple',
          input: { key: 'value' },
        },
      });

      expect(startResponse.statusCode).toBe(201);
      const started = startResponse.json();
      expect(started.workflowType).toBe('wf.api.simple');
      expect(started.lifecycle).toBe('running');
      expect(typeof started.startedAt).toBe('string');

      const summaryResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}`,
      });
      expect(summaryResponse.statusCode).toBe(200);
      const summary = summaryResponse.json();
      expect(summary.runId).toBe(started.runId);

      const treeResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}/tree`,
      });
      expect(treeResponse.statusCode).toBe(200);
      expect(treeResponse.json().tree.runId).toBe(started.runId);

      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs?lifecycle=running&workflowType=wf.api.simple',
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().items).toHaveLength(1);

      const definitionResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions/wf.api.simple',
      });
      expect(definitionResponse.statusCode).toBe(200);
      const definition = definitionResponse.json();
      expect(definition.states).toContain('start');
      expect(definition.transitions).toEqual([{ from: 'start', to: 'done', name: 'complete' }]);

      const logsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}/logs`,
      });
      expect(logsResponse.statusCode).toBe(200);
      expect(logsResponse.json().items).toEqual([]);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
