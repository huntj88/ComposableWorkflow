import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { LockProvider } from '../locking/lock-provider.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { withTransaction } from '../persistence/db.js';
import type { WorkflowLifecycle } from '../lifecycle/lifecycle-machine.js';

interface RunLifecycleRow {
  run_id: string;
  lifecycle: string;
}

export interface ReconcileRequest {
  limit?: number;
  dryRun?: boolean;
}

export interface ReconcileResult {
  scanned: number;
  recovered: number;
  skipped: number;
  failed: number;
  startedAt: string;
  completedAt: string;
}

export interface ReconcileService {
  reconcile: (request?: ReconcileRequest) => Promise<ReconcileResult>;
}

export interface ReconcileServiceDependencies {
  pool: Pool;
  lockProvider: LockProvider;
  orchestrator: Orchestrator;
  now?: () => Date;
  lockTtlMs?: number;
}

const RECOVERABLE_LIFECYCLES: WorkflowLifecycle[] = [
  'running',
  'pausing',
  'resuming',
  'recovering',
];

export const createReconcileService = (deps: ReconcileServiceDependencies): ReconcileService => {
  const now = deps.now ?? (() => new Date());
  const lockTtlMs = deps.lockTtlMs ?? 30_000;

  return {
    reconcile: async (request = {}) => {
      const startedAt = now().toISOString();
      const limit = Math.max(1, Math.min(500, request.limit ?? 100));
      const dryRun = request.dryRun ?? false;
      const ownerId = `reconcile_${randomUUID()}`;

      const listed = await deps.pool.query<RunLifecycleRow>(
        `
SELECT run_id, lifecycle
FROM workflow_runs
WHERE lifecycle = ANY($1::text[])
ORDER BY started_at ASC
LIMIT $2
`,
        [RECOVERABLE_LIFECYCLES, limit],
      );

      let recovered = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of listed.rows) {
        const reconcileLockKey = `reconcile:${row.run_id}`;
        const lockAcquired = await deps.lockProvider.acquire(reconcileLockKey, ownerId, lockTtlMs);
        if (!lockAcquired) {
          skipped += 1;
          continue;
        }

        try {
          if (dryRun) {
            recovered += 1;
            continue;
          }

          const shouldRecover = await withTransaction(deps.pool, async (client) => {
            const runResult = await client.query<RunLifecycleRow>(
              'SELECT run_id, lifecycle FROM workflow_runs WHERE run_id = $1 FOR UPDATE',
              [row.run_id],
            );

            if (runResult.rowCount !== 1) {
              return false;
            }

            const run = runResult.rows[0];
            if (!RECOVERABLE_LIFECYCLES.includes(run.lifecycle as WorkflowLifecycle)) {
              return false;
            }

            if (run.lifecycle === 'running') {
              const recoveredAlready = await client.query<{ event_id: string }>(
                `
SELECT event_id
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.recovered'
LIMIT 1
`,
                [run.run_id],
              );

              if ((recoveredAlready.rowCount ?? 0) > 0) {
                return false;
              }
            }

            if (run.lifecycle !== 'recovering') {
              await client.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
                run.run_id,
                'recovering',
              ]);
              await client.query(
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
  $1,
  $2,
  COALESCE(MAX(sequence), 0) + 1,
  'workflow.recovering',
  $3,
  NULL,
  NULL
FROM workflow_events
WHERE run_id = $2
`,
                [`evt_${randomUUID()}`, run.run_id, now().toISOString()],
              );
            }

            return true;
          });

          if (!shouldRecover) {
            skipped += 1;
            continue;
          }

          await deps.orchestrator.resumeRun(row.run_id);
          recovered += 1;
        } catch {
          failed += 1;
        } finally {
          await deps.lockProvider.release(reconcileLockKey, ownerId);
        }
      }

      return {
        scanned: listed.rows.length,
        recovered,
        skipped,
        failed,
        startedAt,
        completedAt: now().toISOString(),
      };
    },
  };
};
