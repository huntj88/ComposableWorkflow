import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type {
  WorkflowEvent,
  WorkflowInstrumentation,
  WorkflowMetric,
  WorkflowTrace,
} from '@composable-workflow/workflow-lib/contracts';

import { createApiServer } from '../../src/api/server.js';
import {
  createSpawnCommandRunnerAdapter,
  type CommandRunnerAdapter,
} from '../../src/command/command-runner.js';
import type { WorkflowPackageSource } from '../../src/config.js';
import { InMemoryLockProvider, type LockProvider } from '../../src/locking/lock-provider.js';
import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
} from '../../src/observability/instrumentation-adapter.js';
import { createOrchestrator, type Orchestrator } from '../../src/orchestrator/orchestrator.js';
import { createPool } from '../../src/persistence/db.js';
import {
  createEventRepository,
  type EventRepository,
} from '../../src/persistence/event-repository.js';
import {
  createIdempotencyRepository,
  type IdempotencyRepository,
} from '../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunRepository } from '../../src/persistence/run-repository.js';
import { createReconcileService } from '../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../src/recovery/startup-reconcile.js';
import {
  createWorkflowRegistry,
  type WorkflowRegistry,
} from '../../src/registry/workflow-registry.js';
import { loadWorkflowPackages } from '../../src/loader/load-packages.js';
import { createBarrier, type BarrierControl } from './barrier.js';
import { createCaptureSink, type HarnessCaptureSink } from './capture-sink.js';
import {
  createFaultInjector,
  type FaultInjector,
  type FaultMode,
  type FaultCheckpointHit,
} from './fault-injector.js';
import { createFakeClock, type FakeClock } from './fake-clock.js';
import {
  createPostgresTestContainer,
  type PostgresTestContainerHandle,
  type PostgresTestContainerOptions,
} from './postgres-container.js';

type IdFactory = () => string;

const createDeterministicIdFactory = (prefix: string): IdFactory => {
  let sequence = 0;
  return () => `${prefix}_${++sequence}`;
};

const wrapRunRepositoryWithFaults = (base: RunRepository, fault: FaultInjector): RunRepository => ({
  upsertRunSummary: async (client, summary) => {
    await fault.checkpoint('persistence.before.upsertRunSummary');
    const result = await base.upsertRunSummary(client, summary);
    await fault.checkpoint('persistence.after.upsertRunSummary');
    return result;
  },
  getRunSummary: async (client, runId) => {
    await fault.checkpoint('persistence.before.getRunSummary');
    const result = await base.getRunSummary(client, runId);
    await fault.checkpoint('persistence.after.getRunSummary');
    return result;
  },
});

const wrapEventRepositoryWithFaults = (
  base: EventRepository,
  fault: FaultInjector,
): EventRepository => ({
  appendEvent: async (client, input) => {
    await fault.checkpoint('before_event_append');
    await fault.checkpoint('persistence.before.appendEvent');
    const result = await base.appendEvent(client, input);
    await fault.checkpoint('after_event_append_before_ack');
    await fault.checkpoint('persistence.after.appendEvent');
    return result;
  },
});

const wrapLockProviderWithFaults = (base: LockProvider, fault: FaultInjector): LockProvider => ({
  acquire: async (runId, ownerId, ttlMs) => {
    await fault.checkpoint('before_lock_acquire');
    const acquired = await base.acquire(runId, ownerId, ttlMs);
    if (acquired) {
      await fault.checkpoint('after_lock_acquire');
    }

    return acquired;
  },
  renew: async (runId, ownerId, ttlMs) => {
    await base.renew(runId, ownerId, ttlMs);
  },
  release: async (runId, ownerId) => {
    await base.release(runId, ownerId);
  },
});

const wrapOrchestratorWithFaults = (base: Orchestrator, fault: FaultInjector): Orchestrator => ({
  startRun: async (request) => {
    await fault.checkpoint('orchestration.before.startRun');
    const result = await base.startRun(request);
    await fault.checkpoint('orchestration.after.startRun');
    return result;
  },
  resumeRun: async (runId, input) => {
    await fault.checkpoint('orchestration.before.resumeRun');
    await base.resumeRun(runId, input);
    await fault.checkpoint('orchestration.after.resumeRun');
  },
});

export interface IntegrationHarnessOptions {
  postgres?: PostgresTestContainerOptions & {
    useContainer?: boolean;
    connectionString?: string;
  };
  packageSources?: WorkflowPackageSource[];
  registry?: WorkflowRegistry;
  registerWorkflows?: (registry: WorkflowRegistry) => void;
  adapters?: {
    persistence?: {
      pool?: Pool;
      runRepository?: RunRepository;
      eventRepository?: EventRepository;
      idempotencyRepository?: IdempotencyRepository;
    };
    lockProvider?: LockProvider;
    commandRunner?: CommandRunnerAdapter;
    instrumentation?: WorkflowInstrumentation;
  };
  clock?: FakeClock;
  ids?: {
    runIdFactory?: IdFactory;
    eventIdFactory?: IdFactory;
    ownerIdFactory?: IdFactory;
  };
  startupReconcile?: boolean;
}

export interface HarnessControls {
  clock: Pick<FakeClock, 'setNow' | 'advanceByMs' | 'now'>;
  barrier: Pick<BarrierControl, 'wait' | 'release' | 'reset'>;
  fault: {
    inject: (
      name: string,
      mode:
        | FaultMode
        | { mode: FaultMode; action?: 'throw' | 'barrier'; barrierName?: string; error?: Error },
    ) => void;
    clear: (name?: string) => void;
    listInjected: () => ReadonlyArray<{
      name: string;
      mode: FaultMode;
      action: 'throw' | 'barrier';
    }>;
    listTriggered: () => ReadonlyArray<FaultCheckpointHit>;
  };
}

export interface IntegrationHarness {
  server: FastifyInstance;
  orchestrator: Orchestrator;
  registry: WorkflowRegistry;
  db: {
    pool: Pool;
    connectionString?: string;
    container?: PostgresTestContainerHandle;
  };
  controls: HarnessControls;
  sinks: HarnessCaptureSink;
  diagnostics: {
    snapshot: (runId?: string) => {
      lifecycleTimeline: WorkflowEvent[];
      eventStream: WorkflowEvent[];
      faults: FaultCheckpointHit[];
      logs: ReturnType<HarnessCaptureSink['snapshot']>['logs'];
      metrics: ReturnType<HarnessCaptureSink['snapshot']>['metrics'];
      traces: ReturnType<HarnessCaptureSink['snapshot']>['traces'];
    };
  };
  shutdown: () => Promise<void>;
}

export const createIntegrationHarness = async (
  options: IntegrationHarnessOptions = {},
): Promise<IntegrationHarness> => {
  const barrier = createBarrier();
  const faultInjector = createFaultInjector(barrier);
  const clock = options.clock ?? createFakeClock('2026-02-21T00:00:00.000Z');
  const captureSink = createCaptureSink();

  const now = () => clock.now();
  const runIdFactory = options.ids?.runIdFactory ?? createDeterministicIdFactory('run');
  const eventIdFactory = options.ids?.eventIdFactory ?? createDeterministicIdFactory('evt');
  const ownerIdFactory = options.ids?.ownerIdFactory ?? createDeterministicIdFactory('owner');

  let container: PostgresTestContainerHandle | undefined;
  if (options.postgres?.useContainer !== false && !options.postgres?.connectionString) {
    container = await createPostgresTestContainer(options.postgres);
  }

  const connectionString = options.postgres?.connectionString ?? container?.connectionString;
  const pool = options.adapters?.persistence?.pool ?? createPool({ connectionString });

  const registry = options.registry
    ? options.registry
    : options.packageSources
      ? (
          await loadWorkflowPackages({
            sources: options.packageSources,
            collisionPolicy: 'override',
            pool,
          })
        ).registry
      : createWorkflowRegistry('override');

  options.registerWorkflows?.(registry);

  const runRepository = wrapRunRepositoryWithFaults(
    options.adapters?.persistence?.runRepository ?? createRunRepository(),
    faultInjector,
  );
  const eventRepositoryBase = wrapEventRepositoryWithFaults(
    options.adapters?.persistence?.eventRepository ?? createEventRepository(),
    faultInjector,
  );
  const idempotencyRepository =
    options.adapters?.persistence?.idempotencyRepository ?? createIdempotencyRepository();

  const baseInstrumentation =
    options.adapters?.instrumentation ??
    createWorkflowInstrumentationAdapter({
      sinks: captureSink.telemetry,
    });

  const instrumentation: WorkflowInstrumentation = {
    onEvent: async (event: WorkflowEvent) => {
      captureSink.recordEvent(event);
      await baseInstrumentation.onEvent(event);
    },
    onMetric: async (metric: WorkflowMetric) => {
      await baseInstrumentation.onMetric(metric);
    },
    onTrace: async (trace: WorkflowTrace) => {
      await baseInstrumentation.onTrace(trace);
    },
  };

  const eventRepository = createInstrumentedEventRepository({
    baseEventRepository: eventRepositoryBase,
    runRepository,
    instrumentation,
  });

  const lockProvider = wrapLockProviderWithFaults(
    options.adapters?.lockProvider ?? new InMemoryLockProvider(),
    faultInjector,
  );
  const commandRunner = options.adapters?.commandRunner ?? createSpawnCommandRunnerAdapter();

  const orchestratorBase = createOrchestrator({
    pool,
    registry,
    lockProvider,
    runRepository,
    eventRepository,
    idempotencyRepository,
    now,
    runIdFactory,
    eventIdFactory,
    ownerIdFactory,
    commandRunner,
  });
  const orchestrator = wrapOrchestratorWithFaults(orchestratorBase, faultInjector);

  const reconcileService = createReconcileService({
    pool,
    lockProvider,
    orchestrator,
    now,
  });
  const startupReconcile = createStartupReconcileController(reconcileService);

  if (options.startupReconcile ?? false) {
    await startupReconcile.runInitialReconcile();
  }

  const server = await createApiServer({
    pool,
    orchestrator,
    registry,
    reconcileService,
    startupReconcile,
  });

  return {
    server,
    orchestrator,
    registry,
    db: {
      pool,
      connectionString,
      container,
    },
    controls: {
      clock,
      barrier: {
        wait: barrier.wait,
        release: barrier.release,
        reset: barrier.reset,
      },
      fault: {
        inject: faultInjector.inject,
        clear: faultInjector.clear,
        listInjected: faultInjector.listInjected,
        listTriggered: faultInjector.listTriggered,
      },
    },
    sinks: captureSink,
    diagnostics: {
      snapshot: (runId) => {
        const captured = captureSink.snapshot();
        const events = runId
          ? captured.events.filter((event) => event.runId === runId)
          : captured.events;

        return {
          lifecycleTimeline: events.filter((event) => event.eventType.startsWith('workflow.')),
          eventStream: events,
          faults: faultInjector.listTriggered(),
          logs: runId ? captured.logs.filter((item) => item.runId === runId) : captured.logs,
          metrics: captured.metrics,
          traces: runId ? captured.traces.filter((item) => item.runId === runId) : captured.traces,
        };
      },
    },
    shutdown: async () => {
      await server.close();
      await pool.end();
      await container?.stop();
    },
  };
};
