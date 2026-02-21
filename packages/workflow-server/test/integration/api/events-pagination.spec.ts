import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { withTransaction, createPool } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('api events pagination', () => {
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

  it('maintains ordered cursor pagination while new events append', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.api.events',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
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
    const eventRepository = createEventRepository();
    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.api.events',
        input: { test: true },
      });

      await Promise.all(
        Array.from({ length: 30 }).map((_, index) =>
          withTransaction(pool, async (client) => {
            await eventRepository.appendEvent(client, {
              eventId: `evt-page-${index + 1}`,
              runId: started.run.runId,
              eventType: index % 2 === 0 ? 'log' : 'transition.completed',
              timestamp: new Date(1_770_000_010_000 + index).toISOString(),
              payload: {
                index,
                from: 'start',
                to: 'next',
                message: `log-${index}`,
              },
            });
          }),
        ),
      );

      const firstPage = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/events?limit=10`,
      });
      expect(firstPage.statusCode).toBe(200);
      const firstBody = firstPage.json();
      expect(firstBody.items).toHaveLength(10);
      expect(firstBody.nextCursor).toBeTruthy();

      await Promise.all(
        Array.from({ length: 5 }).map((_, index) =>
          withTransaction(pool, async (client) => {
            await eventRepository.appendEvent(client, {
              eventId: `evt-tail-${index + 1}`,
              runId: started.run.runId,
              eventType: 'log',
              timestamp: new Date(1_770_000_020_000 + index).toISOString(),
              payload: {
                index: 100 + index,
                message: `tail-${index}`,
              },
            });
          }),
        ),
      );

      const allSequences = [
        ...(firstBody.items as Array<{ sequence: number }>).map((item) => item.sequence),
      ];
      let cursor: string | undefined = firstBody.nextCursor;

      while (cursor) {
        const response = await server.inject({
          method: 'GET',
          url: `/api/v1/workflows/runs/${started.run.runId}/events?limit=10&cursor=${encodeURIComponent(cursor)}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        allSequences.push(
          ...(body.items as Array<{ sequence: number }>).map((item) => item.sequence),
        );
        cursor = body.nextCursor;
      }

      const unique = new Set(allSequences);
      expect(unique.size).toBe(allSequences.length);

      const sorted = [...allSequences].sort((left, right) => left - right);
      expect(allSequences).toEqual(sorted);
      expect(sorted[0]).toBe(1);
      expect(sorted.at(-1)).toBe(36);

      const filtered = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/events?eventType=log&limit=100`,
      });
      expect(filtered.statusCode).toBe(200);
      expect(
        filtered.json().items.every((item: { eventType: string }) => item.eventType === 'log'),
      ).toBe(true);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
