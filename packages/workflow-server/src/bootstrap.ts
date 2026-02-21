import type { PoolConfig } from 'pg';

import { loadServerConfigFromEnv } from './config.js';
import { loadWorkflowPackages } from './loader/load-packages.js';
import { createPostgresAdvisoryLockProvider } from './locking/postgres-advisory-lock.js';
import { createOrchestrator, type Orchestrator } from './orchestrator/orchestrator.js';
import { createDbConnection, type DbConnection } from './persistence/db.js';
import type { WorkflowRegistry } from './registry/workflow-registry.js';

export interface BootstrapResult {
  db: DbConnection;
  orchestrator: Orchestrator;
  registry: WorkflowRegistry;
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

  const lockProvider = createPostgresAdvisoryLockProvider(db.pool);
  const orchestrator = createOrchestrator({
    pool: db.pool,
    registry: packageResult.registry,
    lockProvider,
  });

  return {
    db,
    orchestrator,
    registry: packageResult.registry,
  };
};
