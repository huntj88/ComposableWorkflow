import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { withTransaction, createPool } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('orchestrator sequence monotonicity', () => {
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

  it('maintains strict per-run sequence ordering under concurrent writes', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.sequence',
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

    const started = await orchestrator.startRun({
      workflowType: 'wf.sequence',
      input: { index: 0 },
    });

    const eventRepository = createEventRepository();

    await Promise.all(
      Array.from({ length: 40 }).map((_, index) =>
        withTransaction(pool, async (client) => {
          await eventRepository.appendEvent(client, {
            eventId: `evt-seq-${index + 1}`,
            runId: started.run.runId,
            eventType: 'log',
            timestamp: new Date(1_770_000_000_000 + index).toISOString(),
            payload: {
              index,
            },
          });
        }),
      ),
    );

    const sequenceRows = await pool.query<{ sequence: number }>(
      'SELECT sequence FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC',
      [started.run.runId],
    );

    const sequences = sequenceRows.rows.map((row) => row.sequence);
    const expected = Array.from({ length: 41 }, (_, index) => index + 1);

    expect(sequences).toEqual(expected);

    await pool.end();
  });
});
