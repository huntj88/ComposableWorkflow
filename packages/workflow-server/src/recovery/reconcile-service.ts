import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { LockProvider } from '../locking/lock-provider.js';
import { appendWorkflowLifecycleEvent } from '../lifecycle/lifecycle-events.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { createEventRepository } from '../persistence/event-repository.js';
import { withTransaction } from '../persistence/db.js';
import type { WorkflowLifecycle } from '../lifecycle/lifecycle-machine.js';
import { hasProgressSinceLatestRecoveryBoundary } from './recovery-state.js';

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
  const eventRepository = createEventRepository();

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
              const progressedSinceRecovery = await hasProgressSinceLatestRecoveryBoundary(
                client,
                run.run_id,
              );

              if (!progressedSinceRecovery) {
                return false;
              }
            }

            if (run.lifecycle !== 'recovering') {
              await client.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
                run.run_id,
                'recovering',
              ]);
              await appendWorkflowLifecycleEvent({
                client,
                eventRepository,
                eventId: `evt_${randomUUID()}`,
                runId: run.run_id,
                eventType: 'workflow.recovering',
                timestamp: now().toISOString(),
              });
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
