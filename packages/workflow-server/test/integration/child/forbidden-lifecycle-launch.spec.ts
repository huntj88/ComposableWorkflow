import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('forbidden lifecycle child launch', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('does not execute child launch while parent is in a restricted lifecycle safe point', async () => {
    const registry = createWorkflowRegistry('reject');

    registry.register({
      workflowType: 'wf.child.forbidden-target',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: (ctx: { complete: (output: unknown) => void }) => {
            ctx.complete({ ok: true });
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    registry.register({
      workflowType: 'wf.parent.forbidden-launch',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx: {
            launchChild: (request: { workflowType: string; input: unknown }) => Promise<unknown>;
            complete: (output: unknown) => void;
          }) => {
            await ctx.launchChild({
              workflowType: 'wf.child.forbidden-target',
              input: {},
            });
            ctx.complete({ ok: true });
          },
        },
      }),
      packageName: 'pkg-test',
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

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.parent.forbidden-launch',
        input: {},
      });

      await pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
        started.run.runId,
        'pausing',
      ]);

      await orchestrator.resumeRun(started.run.runId);

      const parent = await pool.query<{
        lifecycle: string;
      }>('SELECT lifecycle FROM workflow_runs WHERE run_id = $1', [started.run.runId]);
      expect(parent.rows[0]?.lifecycle).toBe('paused');

      const childLinks = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM workflow_run_children WHERE parent_run_id = $1',
        [started.run.runId],
      );
      expect(childLinks.rows[0]?.count).toBe(0);

      const childEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type LIKE 'child.%'",
        [started.run.runId],
      );
      expect(childEvents.rows[0]?.count).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
