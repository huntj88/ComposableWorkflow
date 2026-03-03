import type { Pool, PoolConfig } from 'pg';
import type { WorkflowInstrumentation } from '@composable-workflow/workflow-lib/contracts';

import { createApiServer, type ApiServerDependencies } from './api/server.js';
import type { CommandPolicy } from './command/command-policy.js';
import type { CommandRunnerAdapter } from './command/command-runner.js';
import { loadServerConfigFromEnv } from './config.js';
import type { WorkflowPackageSource, WorkflowTypeCollisionPolicy } from './config.js';
import { loadWorkflowPackages } from './loader/load-packages.js';
import type { LockProvider } from './locking/lock-provider.js';
import { createPostgresAdvisoryLockProvider } from './locking/postgres-advisory-lock.js';
import { createOrchestrator, type Orchestrator } from './orchestrator/orchestrator.js';
import { createDbConnection, type DbConnection } from './persistence/db.js';
import { createEventRepository } from './persistence/event-repository.js';
import type { EventRepository } from './persistence/event-repository.js';
import { createIdempotencyRepository } from './persistence/idempotency-repository.js';
import type { IdempotencyRepository } from './persistence/idempotency-repository.js';
import { runMigrationsOnStartup } from './persistence/migrate.js';
import { createRunRepository } from './persistence/run-repository.js';
import type { RunRepository } from './persistence/run-repository.js';
import { createReconcileService, type ReconcileService } from './recovery/reconcile-service.js';
import {
  createStartupReconcileController,
  type StartupReconcileController,
} from './recovery/startup-reconcile.js';
import { createWorkflowRegistry } from './registry/workflow-registry.js';
import type { WorkflowRegistry } from './registry/workflow-registry.js';
import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
} from './observability/instrumentation-adapter.js';
import { registerInternalWorkflows } from './bootstrap/register-internal-workflows.js';

export interface BootstrapResult {
  server: Awaited<ReturnType<typeof createApiServer>>;
  db: DbConnection;
  orchestrator: Orchestrator;
  registry: WorkflowRegistry;
  reconcileService: ReconcileService;
  startupReconcile: StartupReconcileController;
  shutdown: () => Promise<void>;
}

export interface BootstrapOptions {
  pool?: Pool;
  poolConfig?: PoolConfig;
  initializePersistence?: boolean;
  startupReconcile?: boolean;
  packageSources?: WorkflowPackageSource[];
  collisionPolicy?: WorkflowTypeCollisionPolicy;
  commandPolicy?: CommandPolicy;
  registry?: WorkflowRegistry;
  now?: () => Date;
  ids?: {
    runIdFactory?: () => string;
    eventIdFactory?: () => string;
    ownerIdFactory?: () => string;
  };
  adapters?: {
    lockProvider?: LockProvider;
    runRepository?: RunRepository;
    eventRepository?: EventRepository;
    idempotencyRepository?: IdempotencyRepository;
    commandRunner?: CommandRunnerAdapter;
    instrumentation?: WorkflowInstrumentation;
  };
}

export const bootstrapWorkflowServer = async (
  options: BootstrapOptions = {},
): Promise<BootstrapResult> => {
  if (options.initializePersistence ?? false) {
    await runMigrationsOnStartup();
  }

  const config = loadServerConfigFromEnv();
  const db = options.pool
    ? {
        pool: options.pool,
        close: async () => {
          await options.pool?.end();
        },
      }
    : createDbConnection(options.poolConfig ?? {});

  let registry = options.registry;
  const collisionPolicy = options.collisionPolicy ?? config.collisionPolicy;

  if (!registry) {
    const packageSources = options.packageSources ?? config.workflowPackages;

    registry = createWorkflowRegistry(collisionPolicy);
    registerInternalWorkflows(registry);

    if (packageSources.length > 0) {
      await loadWorkflowPackages({
        sources: packageSources,
        collisionPolicy,
        registry,
        pool: db.pool,
      });
    }
  } else {
    registerInternalWorkflows(registry);
  }

  const runRepository = options.adapters?.runRepository ?? createRunRepository();
  const baseEventRepository = options.adapters?.eventRepository ?? createEventRepository();
  const idempotencyRepository =
    options.adapters?.idempotencyRepository ?? createIdempotencyRepository();
  const instrumentation =
    options.adapters?.instrumentation ?? createWorkflowInstrumentationAdapter();
  const eventRepository = createInstrumentedEventRepository({
    baseEventRepository,
    runRepository,
    instrumentation,
  });

  const lockProvider =
    options.adapters?.lockProvider ?? createPostgresAdvisoryLockProvider(db.pool);
  const orchestrator = createOrchestrator({
    pool: db.pool,
    registry,
    lockProvider,
    runRepository,
    eventRepository,
    idempotencyRepository,
    commandPolicy: options.commandPolicy ?? config.commandPolicy,
    commandRunner: options.adapters?.commandRunner,
    now: options.now,
    runIdFactory: options.ids?.runIdFactory,
    eventIdFactory: options.ids?.eventIdFactory,
    ownerIdFactory: options.ids?.ownerIdFactory,
  });
  const reconcileService = createReconcileService({
    pool: db.pool,
    lockProvider,
    orchestrator,
    now: options.now,
  });
  const startupReconcile = createStartupReconcileController(reconcileService);

  if (options.startupReconcile ?? true) {
    await startupReconcile.runInitialReconcile();
  }

  const serverDeps: ApiServerDependencies = {
    pool: db.pool,
    orchestrator,
    registry,
    reconcileService,
    startupReconcile,
  };
  const server = await createApiServer(serverDeps);

  const shutdown = async (): Promise<void> => {
    await server.close();
    await db.close();
  };

  return {
    server,
    db,
    orchestrator,
    registry,
    reconcileService,
    startupReconcile,
    shutdown,
  };
};
