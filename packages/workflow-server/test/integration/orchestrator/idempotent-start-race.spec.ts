import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('orchestrator idempotent start race', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('deduplicates concurrent start requests by idempotency key', async () => {
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
