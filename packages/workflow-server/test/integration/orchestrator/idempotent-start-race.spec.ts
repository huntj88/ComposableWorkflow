import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('orchestrator idempotent start race', () => {
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

  it('deduplicates concurrent start requests by idempotency key', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.idempotent-race',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            return;
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const pool = createPool({ connectionString: databaseUrl });
    const orchestrator = createOrchestrator({
      pool,
      registry,
      lockProvider: new InMemoryLockProvider(),
    });

    try {
      const responses = await Promise.all(
        Array.from({ length: 16 }).map(() =>
          orchestrator.startRun({
            workflowType: 'wf.idempotent-race',
            input: { amount: 42 },
            idempotencyKey: 'idem-race-key-1',
          }),
        ),
      );

      const runIds = new Set(responses.map((response) => response.run.runId));
      expect(runIds.size).toBe(1);
      expect(responses.filter((response) => response.created).length).toBe(1);

      const runCount = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE workflow_type = $1',
        ['wf.idempotent-race'],
      );
      expect(runCount.rows[0].count).toBe(1);

      const startedCount = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE event_type = 'workflow.started' AND run_id = $1",
        [responses[0].run.runId],
      );
      expect(startedCount.rows[0].count).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
