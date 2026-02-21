import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { LockProvider } from '../locking/lock-provider.js';
import { withTransaction } from '../persistence/db.js';
import { createEventRepository, type EventRepository } from '../persistence/event-repository.js';
import {
  createIdempotencyRepository,
  type IdempotencyRepository,
} from '../persistence/idempotency-repository.js';
import { createRunRepository, type RunRepository } from '../persistence/run-repository.js';
import type { WorkflowRegistry } from '../registry/workflow-registry.js';
import {
  defaultEventIdFactory,
  defaultRunIdFactory,
  type StartRunRequest,
  type StartRunResponse,
  startRun,
} from './start-run.js';
import { runTransitionStep } from './transition-runner.js';

const defaultOwnerIdFactory = (): string => `runner_${randomUUID()}`;

export interface Orchestrator {
  startRun: (request: StartRunRequest) => Promise<StartRunResponse>;
  resumeRun: (runId: string, input?: unknown) => Promise<void>;
}

export interface OrchestratorDependencies {
  pool: Pool;
  registry: WorkflowRegistry;
  lockProvider: LockProvider;
  runRepository?: RunRepository;
  eventRepository?: EventRepository;
  idempotencyRepository?: IdempotencyRepository;
  now?: () => Date;
  runIdFactory?: () => string;
  eventIdFactory?: () => string;
  ownerIdFactory?: () => string;
  lockTtlMs?: number;
  maxIterations?: number;
}

export const createOrchestrator = (deps: OrchestratorDependencies): Orchestrator => {
  const runRepository = deps.runRepository ?? createRunRepository();
  const eventRepository = deps.eventRepository ?? createEventRepository();
  const idempotencyRepository = deps.idempotencyRepository ?? createIdempotencyRepository();
  const ownerIdFactory = deps.ownerIdFactory ?? defaultOwnerIdFactory;
  const lockTtlMs = deps.lockTtlMs ?? 30_000;
  const maxIterations = deps.maxIterations ?? 256;
  const now = deps.now ?? (() => new Date());
  const runIdFactory = deps.runIdFactory ?? defaultRunIdFactory;
  const eventIdFactory = deps.eventIdFactory ?? defaultEventIdFactory;

  return {
    startRun: (request) =>
      startRun(
        {
          pool: deps.pool,
          registry: deps.registry,
          runRepository,
          eventRepository,
          idempotencyRepository,
          now,
          runIdFactory,
          eventIdFactory,
        },
        request,
      ),
    resumeRun: async (runId, input) => {
      const ownerId = ownerIdFactory();
      const acquired = await deps.lockProvider.acquire(runId, ownerId, lockTtlMs);

      if (!acquired) {
        return;
      }

      try {
        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          const stepResult = await withTransaction(deps.pool, async (client) => {
            const run = await runRepository.getRunSummary(client, runId);
            if (!run) {
              throw new Error(`Run ${runId} not found`);
            }

            return runTransitionStep({
              client,
              deps: {
                registry: deps.registry,
                runRepository,
                eventRepository,
                idempotencyRepository,
                eventIdFactory,
                runIdFactory,
                now,
              },
              run,
              input,
            });
          });

          if (stepResult.terminal || !stepResult.progressed) {
            return;
          }

          await deps.lockProvider.renew(runId, ownerId, lockTtlMs);
        }

        throw new Error(`Resume loop exceeded ${maxIterations} iterations for run ${runId}`);
      } finally {
        await deps.lockProvider.release(runId, ownerId);
      }
    },
  };
};
