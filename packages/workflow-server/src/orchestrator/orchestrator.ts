import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { LockProvider } from '../locking/lock-provider.js';
import type { CommandPolicy } from '../command/command-policy.js';
import type { CommandRunnerAdapter } from '../command/command-runner.js';
import { withTransaction, type DbClient } from '../persistence/db.js';
import { createEventRepository, type EventRepository } from '../persistence/event-repository.js';
import {
  createHumanFeedbackProjectionRepository,
  type HumanFeedbackProjectionRepository,
} from '../persistence/human-feedback-projection-repository.js';
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
  humanFeedbackProjectionRepository?: HumanFeedbackProjectionRepository;
  idempotencyRepository?: IdempotencyRepository;
  now?: () => Date;
  runIdFactory?: () => string;
  eventIdFactory?: () => string;
  commandPolicy?: CommandPolicy;
  commandRunner?: CommandRunnerAdapter;
  ownerIdFactory?: () => string;
  lockTtlMs?: number;
  maxIterations?: number;
}

export const createOrchestrator = (deps: OrchestratorDependencies): Orchestrator => {
  const runRepository = deps.runRepository ?? createRunRepository();
  const eventRepository = deps.eventRepository ?? createEventRepository();
  const humanFeedbackProjectionRepository =
    deps.humanFeedbackProjectionRepository ?? createHumanFeedbackProjectionRepository();
  const idempotencyRepository = deps.idempotencyRepository ?? createIdempotencyRepository();
  const ownerIdFactory = deps.ownerIdFactory ?? defaultOwnerIdFactory;
  const lockTtlMs = deps.lockTtlMs ?? 30_000;
  const maxIterations = deps.maxIterations ?? 256;
  const lockAcquireRetryDelayMs = 10;
  const lockAcquireMaxAttempts = 200;
  const now = deps.now ?? (() => new Date());
  const runIdFactory = deps.runIdFactory ?? defaultRunIdFactory;
  const eventIdFactory = deps.eventIdFactory ?? defaultEventIdFactory;

  const resolveRunInput = async (
    client: DbClient,
    runId: string,
    explicitInput: unknown,
  ): Promise<unknown> => {
    if (explicitInput !== undefined) {
      return explicitInput;
    }

    const startedInput = await eventRepository.getStartedInput?.(client, runId);
    if (!startedInput?.present) {
      return undefined;
    }

    return startedInput.value;
  };

  const orchestrator: Orchestrator = {
    startRun: async (request) => {
      const started = await startRun(
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
      );

      if (started.created) {
        setImmediate(() => {
          void orchestrator.resumeRun(started.run.runId, request.input).catch(() => undefined);
        });
      }

      return started;
    },
    resumeRun: async (runId, input) => {
      const ownerId = ownerIdFactory();
      let acquired = false;

      for (let attempt = 0; attempt < lockAcquireMaxAttempts; attempt += 1) {
        acquired = await deps.lockProvider.acquire(runId, ownerId, lockTtlMs);
        if (acquired) {
          break;
        }

        await new Promise((resolve) => {
          setTimeout(resolve, lockAcquireRetryDelayMs);
        });
      }

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

            const resolvedInput = await resolveRunInput(client, runId, input);

            return runTransitionStep({
              client,
              deps: {
                registry: deps.registry,
                runRepository,
                eventRepository,
                humanFeedbackProjectionRepository,
                idempotencyRepository,
                commandPolicy: deps.commandPolicy,
                commandRunner: deps.commandRunner,
                eventIdFactory,
                runIdFactory,
                now,
              },
              run,
              input: resolvedInput,
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

  return orchestrator;
};
