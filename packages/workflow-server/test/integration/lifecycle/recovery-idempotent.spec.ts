import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('lifecycle recovery idempotence', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('reconcile is deterministic and idempotent for recoverable runs', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.recovery',
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
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
    });

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.recovery',
        input: {},
      });

      await pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
        started.run.runId,
        'recovering',
      ]);

      const first = await reconcileService.reconcile({
        limit: 100,
        dryRun: false,
      });
      expect(first.recovered).toBeGreaterThanOrEqual(0);
      expect(first.recovered).toBeLessThanOrEqual(1);

      const second = await reconcileService.reconcile({
        limit: 100,
        dryRun: false,
      });
      expect(second.recovered).toBe(0);

      const recoveredEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
        [started.run.runId],
      );
      expect(recoveredEvents.rows[0].count).toBe(1);
    } finally {
      await server.close();
      await pool.end();
    }
  });

  it('allows another recovery after transition progress since the last recovery', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.recovery.progress',
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
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
    });

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.recovery.progress',
        input: {},
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });

      await pool.query(
        `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
SELECT
  $2,
  $1,
  COALESCE(MAX(sequence), 0) + 1,
  'workflow.recovered',
  NOW(),
  NULL,
  NULL
FROM workflow_events
WHERE run_id = $1
`,
        [started.run.runId, `evt_seed_recovered_${randomUUID()}`],
      );

      await pool.query(
        `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
SELECT
  $2,
  $1,
  COALESCE(MAX(sequence), 0) + 1,
  'transition.completed',
  NOW(),
  '{"from":"active","to":"active","name":"synthetic-progress"}'::jsonb,
  NULL
FROM workflow_events
WHERE run_id = $1
`,
        [started.run.runId, `evt_progress_after_recovery_${randomUUID()}`],
      );

      const second = await reconcileService.reconcile({
        limit: 100,
        dryRun: false,
      });
      expect(second.recovered).toBe(1);

      const recoveredEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
        [started.run.runId],
      );
      expect(recoveredEvents.rows[0].count).toBe(2);
    } finally {
      await server.close();
      await pool.end();
    }
  });

  it('reconcile resumes input-dependent workflows without explicit resume input', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.lifecycle.recovery.input-required',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'active',
        states: {
          active: (ctx: WorkflowContext<{ requestId?: string }, unknown>) => {
            const requestId =
              typeof ctx.input?.requestId === 'string' ? ctx.input.requestId : undefined;

            if (!requestId) {
              throw new Error('Missing requestId');
            }
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
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
    });

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.lifecycle.recovery.input-required',
        input: { requestId: 'req-recovery-input' },
      });

      await pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
        started.run.runId,
        'recovering',
      ]);

      await pool.query(
        `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
SELECT
  $2,
  $1,
  COALESCE(MAX(sequence), 0) + 1,
  'workflow.recovering',
  NOW(),
  NULL,
  NULL
FROM workflow_events
WHERE run_id = $1
`,
        [started.run.runId, `evt_recovery_input_${randomUUID()}`],
      );

      await orchestrator.resumeRun(started.run.runId);

      const failureEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.failed'",
        [started.run.runId],
      );
      expect(failureEvents.rows[0].count).toBe(0);

      const recoveredEvents = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.recovered'",
        [started.run.runId],
      );
      expect(recoveredEvents.rows[0].count).toBeGreaterThanOrEqual(1);

      const startedInput = await pool.query<{ payload_jsonb: { input?: { requestId?: string } } }>(
        `
SELECT payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.started'
ORDER BY sequence ASC
LIMIT 1
`,
        [started.run.runId],
      );
      expect(startedInput.rows[0]?.payload_jsonb?.input?.requestId).toBe('req-recovery-input');
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
