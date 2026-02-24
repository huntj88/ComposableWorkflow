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

describe('child launch and await', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('launches a child run, awaits completion, and exposes lineage in run tree', async () => {
    const registry = createWorkflowRegistry('reject');

    registry.register({
      workflowType: 'wf.child.success',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: (ctx: { complete: (output: unknown) => void }) => {
            ctx.complete({ value: 42 });
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    registry.register({
      workflowType: 'wf.parent.await',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx: {
            launchChild: (request: { workflowType: string; input: unknown }) => Promise<unknown>;
            complete: (output: unknown) => void;
          }) => {
            const childOutput = await ctx.launchChild({
              workflowType: 'wf.child.success',
              input: { value: 42 },
            });
            ctx.complete({ parentReceived: childOutput });
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
        workflowType: 'wf.parent.await',
        input: {},
      });

      await orchestrator.resumeRun(started.run.runId);

      const parentSummary = await pool.query<{
        lifecycle: string;
      }>('SELECT lifecycle FROM workflow_runs WHERE run_id = $1', [started.run.runId]);
      expect(parentSummary.rows[0]?.lifecycle).toBe('completed');

      const parentCompleted = await pool.query<{
        payload_jsonb: Record<string, unknown> | null;
      }>(
        `
SELECT payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.completed'
ORDER BY sequence DESC
LIMIT 1
`,
        [started.run.runId],
      );

      expect(parentCompleted.rows[0]?.payload_jsonb).toEqual({
        output: {
          parentReceived: {
            value: 42,
          },
        },
      });

      const childEvents = await pool.query<{
        event_type: string;
      }>(
        `
SELECT event_type
FROM workflow_events
WHERE run_id = $1
  AND event_type IN ('child.started', 'child.completed')
ORDER BY sequence ASC
`,
        [started.run.runId],
      );
      expect(childEvents.rows.map((row) => row.event_type)).toEqual([
        'child.started',
        'child.completed',
      ]);

      const childRunLink = await pool.query<{
        child_run_id: string;
      }>('SELECT child_run_id FROM workflow_run_children WHERE parent_run_id = $1', [
        started.run.runId,
      ]);
      expect(childRunLink.rowCount).toBe(1);

      const childRun = await pool.query<{
        run_id: string;
        parent_run_id: string | null;
      }>('SELECT run_id, parent_run_id FROM workflow_runs WHERE run_id = $1', [
        childRunLink.rows[0]?.child_run_id,
      ]);
      expect(childRun.rows[0]?.parent_run_id).toBe(started.run.runId);

      const treeResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/tree?depth=1&includeCompletedChildren=true`,
      });

      expect(treeResponse.statusCode).toBe(200);
      expect(treeResponse.json().tree.children).toHaveLength(1);
      expect(treeResponse.json().tree.children[0].runId).toBe(childRun.rows[0]?.run_id);
    } finally {
      await server.close();
      await pool.end();
    }
  });

  it('passes child launch input into awaited child transition handlers', async () => {
    const registry = createWorkflowRegistry('reject');

    registry.register({
      workflowType: 'wf.child.requires-input',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: (ctx: {
            input: { requestId?: string };
            fail: (error: Error) => void;
            complete: (output: unknown) => void;
          }) => {
            if (!ctx.input?.requestId) {
              ctx.fail(new Error('Missing requestId'));
              return;
            }

            ctx.complete({ echoedRequestId: ctx.input.requestId });
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    registry.register({
      workflowType: 'wf.parent.await-input-child',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx: {
            launchChild: (request: { workflowType: string; input: unknown }) => Promise<unknown>;
            complete: (output: unknown) => void;
          }) => {
            const childOutput = await ctx.launchChild({
              workflowType: 'wf.child.requires-input',
              input: { requestId: 'req-child-1' },
            });
            ctx.complete({ parentReceived: childOutput });
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
        workflowType: 'wf.parent.await-input-child',
        input: {},
      });

      await orchestrator.resumeRun(started.run.runId);

      const parentSummary = await pool.query<{ lifecycle: string }>(
        'SELECT lifecycle FROM workflow_runs WHERE run_id = $1',
        [started.run.runId],
      );
      expect(parentSummary.rows[0]?.lifecycle).toBe('completed');

      const parentCompleted = await pool.query<{ payload_jsonb: Record<string, unknown> | null }>(
        `
SELECT payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.completed'
ORDER BY sequence DESC
LIMIT 1
`,
        [started.run.runId],
      );
      expect(parentCompleted.rows[0]?.payload_jsonb).toEqual({
        output: {
          parentReceived: {
            echoedRequestId: 'req-child-1',
          },
        },
      });
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
