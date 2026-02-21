export const getServerStatus = (): 'ready' => 'ready';

export const initializeServerPersistence = async (): Promise<void> => {
  await runMigrationsOnStartup();
};

export const initializePackageRegistry = async () => {
  const config = loadServerConfigFromEnv();

  return loadWorkflowPackages({
    sources: config.workflowPackages,
    collisionPolicy: config.collisionPolicy,
  });
};

export * from './persistence/db.js';
export * from './persistence/migrate.js';
export * from './persistence/run-repository.js';
export * from './persistence/event-repository.js';
export * from './persistence/definition-repository.js';
export * from './persistence/idempotency-repository.js';
export * from './config.js';
export * from './loader/manifest-schema.js';
export * from './loader/source-resolvers.js';
export * from './loader/load-packages.js';
export * from './registry/errors.js';
export * from './registry/workflow-registry.js';
export * from './locking/lock-provider.js';
export * from './locking/postgres-advisory-lock.js';
export * from './orchestrator/start-run.js';
export * from './orchestrator/transition-runner.js';
export * from './orchestrator/orchestrator.js';
export * from './lifecycle/lifecycle-machine.js';
export * from './lifecycle/control-routes.js';
export * from './recovery/reconcile-service.js';
export * from './recovery/startup-reconcile.js';
export * from './command/command-policy.js';
export * from './command/command-runner.js';
export * from './command/redaction.js';
export * from './command/truncation.js';
export * from './observability/logger.js';
export * from './observability/metrics.js';
export * from './observability/tracing.js';
export * from './observability/instrumentation-adapter.js';
export * from './bootstrap.js';
export * from './api/server.js';
export * from './api/schemas.js';
export * from './read-models/event-pagination.js';
export * from './read-models/run-tree-projection.js';

import { runMigrationsOnStartup } from './persistence/migrate.js';
import { loadServerConfigFromEnv } from './config.js';
import { loadWorkflowPackages } from './loader/load-packages.js';
