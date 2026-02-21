import type { PoolConfig } from 'pg';

import { loadServerConfigFromEnv } from './config.js';
import { loadWorkflowPackages } from './loader/load-packages.js';
import { createPostgresAdvisoryLockProvider } from './locking/postgres-advisory-lock.js';
import { createOrchestrator, type Orchestrator } from './orchestrator/orchestrator.js';
import { createDbConnection, type DbConnection } from './persistence/db.js';
import { createEventRepository } from './persistence/event-repository.js';
import { createRunRepository } from './persistence/run-repository.js';
import { createReconcileService, type ReconcileService } from './recovery/reconcile-service.js';
import {
  createStartupReconcileController,
  type StartupReconcileController,
} from './recovery/startup-reconcile.js';
import type { WorkflowRegistry } from './registry/workflow-registry.js';
import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
} from './observability/instrumentation-adapter.js';

export interface BootstrapResult {
  db: DbConnection;
  orchestrator: Orchestrator;
  registry: WorkflowRegistry;
  reconcileService: ReconcileService;
  startupReconcile: StartupReconcileController;
}

export const bootstrapWorkflowServer = async (
  poolConfig: PoolConfig = {},
): Promise<BootstrapResult> => {
  const config = loadServerConfigFromEnv();
  const db = createDbConnection(poolConfig);
  const packageResult = await loadWorkflowPackages({
    sources: config.workflowPackages,
    collisionPolicy: config.collisionPolicy,
    pool: db.pool,
  });

  const runRepository = createRunRepository();
  const baseEventRepository = createEventRepository();
  const instrumentation = createWorkflowInstrumentationAdapter();
  const eventRepository = createInstrumentedEventRepository({
    baseEventRepository,
    runRepository,
    instrumentation,
  });

  const lockProvider = createPostgresAdvisoryLockProvider(db.pool);
  const orchestrator = createOrchestrator({
    pool: db.pool,
    registry: packageResult.registry,
    lockProvider,
    runRepository,
    eventRepository,
    commandPolicy: config.commandPolicy,
  });
  const reconcileService = createReconcileService({
    pool: db.pool,
    lockProvider,
    orchestrator,
  });
  const startupReconcile = createStartupReconcileController(reconcileService);
  await startupReconcile.runInitialReconcile();

  return {
    db,
    orchestrator,
    registry: packageResult.registry,
    reconcileService,
    startupReconcile,
  };
};
