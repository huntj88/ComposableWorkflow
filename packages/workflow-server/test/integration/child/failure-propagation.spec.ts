import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('child failure propagation', () => {
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

  it('fails parent by default when child fails', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry('reject');

    registry.register({
      workflowType: 'wf.child.failure',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            throw new Error('child boom');
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    registry.register({
      workflowType: 'wf.parent.failure-propagation',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.launchChild({
              workflowType: 'wf.child.failure',
              input: {},
            });
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
        workflowType: 'wf.parent.failure-propagation',
        input: {},
      });

      await orchestrator.resumeRun(started.run.runId);

      const statuses = await pool.query<{
        run_id: string;
        lifecycle: string;
      }>(
        `
SELECT run_id, lifecycle
FROM workflow_runs
WHERE run_id = $1
   OR parent_run_id = $1
ORDER BY run_id ASC
`,
        [started.run.runId],
      );

      const lifecycleByRun = new Map(statuses.rows.map((row) => [row.run_id, row.lifecycle]));
      expect(lifecycleByRun.get(started.run.runId)).toBe('failed');
      expect(Array.from(lifecycleByRun.values()).filter((value) => value === 'failed').length).toBe(
        2,
      );

      const parentEvents = await pool.query<{
        event_type: string;
      }>(
        `
SELECT event_type
FROM workflow_events
WHERE run_id = $1
  AND event_type IN ('child.started', 'child.failed', 'workflow.failed')
ORDER BY sequence ASC
`,
        [started.run.runId],
      );

      expect(parentEvents.rows.map((row) => row.event_type)).toEqual([
        'child.started',
        'child.failed',
        'workflow.failed',
      ]);
    } finally {
      await pool.end();
    }
  });
});
