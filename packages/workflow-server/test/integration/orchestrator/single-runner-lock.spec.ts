import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';
import { createPostgresAdvisoryLockProvider } from '../../../src/locking/postgres-advisory-lock.js';

describe('orchestrator single runner lock', () => {
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

  it('allows only one concurrent runner to mutate run state', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    let unblockStateHandler: (() => void) | undefined;
    const stateBlocker = new Promise<void>((resolve) => {
      unblockStateHandler = resolve;
    });

    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.single-runner',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await stateBlocker;
            ctx.transition('done');
          },
          done: (ctx) => {
            ctx.complete({ ok: true });
          },
        },
        transitions: [{ from: 'start', to: 'done', name: 'to-done' }],
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const pool = createPool({ connectionString: databaseUrl });
    const lockProvider = createPostgresAdvisoryLockProvider(pool);
    const orchestrator = createOrchestrator({
      pool,
      registry,
      lockProvider,
      ownerIdFactory: (() => {
        let index = 0;
        return () => `runner-${(index += 1).toString()}`;
      })(),
    });

    const started = await orchestrator.startRun({
      workflowType: 'wf.single-runner',
      input: { value: 1 },
    });

    const runnerOne = orchestrator.resumeRun(started.run.runId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const runnerTwo = orchestrator.resumeRun(started.run.runId);

    unblockStateHandler?.();
    await Promise.all([runnerOne, runnerTwo]);

    const eventTypesResult = await pool.query<{
      event_type: string;
      count: number;
    }>(
      `
        SELECT event_type, COUNT(*)::int AS count
        FROM workflow_events
        WHERE run_id = $1
        GROUP BY event_type
      `,
      [started.run.runId],
    );

    const counts = new Map(eventTypesResult.rows.map((row) => [row.event_type, row.count]));
    expect(counts.get('transition.completed') ?? 0).toBe(1);
    expect(counts.get('workflow.completed') ?? 0).toBe(1);

    const runResult = await pool.query<{ lifecycle: string; current_state: string }>(
      'SELECT lifecycle, current_state FROM workflow_runs WHERE run_id = $1',
      [started.run.runId],
    );
    expect(runResult.rows[0]).toEqual({
      lifecycle: 'completed',
      current_state: 'done',
    });

    await pool.end();
  });
});
