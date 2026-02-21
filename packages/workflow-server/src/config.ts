import { z } from 'zod';

export const COLLISION_POLICY_ENV_KEY = 'WORKFLOW_TYPE_COLLISION_POLICY';
export const WORKFLOW_PACKAGE_SOURCES_ENV_KEY = 'WORKFLOW_PACKAGE_SOURCES';

export const workflowPackageSourceSchema = z.object({
  source: z.enum(['path', 'pnpm', 'bundle']),
  value: z.string().trim().min(1),
});

export type WorkflowPackageSource = z.infer<typeof workflowPackageSourceSchema>;

export type WorkflowTypeCollisionPolicy = 'reject' | 'override';

export interface WorkflowServerConfig {
  workflowPackages: WorkflowPackageSource[];
  collisionPolicy: WorkflowTypeCollisionPolicy;
  databaseUrl?: string;
}

const workflowPackageSourceListSchema = z.array(workflowPackageSourceSchema);

export const resolveCollisionPolicy = (
  rawPolicy = process.env[COLLISION_POLICY_ENV_KEY],
): WorkflowTypeCollisionPolicy => {
  if (rawPolicy === 'override') {
    return 'override';
  }

  return 'reject';
};

export const parseWorkflowPackageSources = (rawSources?: string): WorkflowPackageSource[] => {
  if (!rawSources) {
    return [];
  }

  const parsed = JSON.parse(rawSources) as unknown;
  return workflowPackageSourceListSchema.parse(parsed);
};

export const loadServerConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): WorkflowServerConfig => ({
  workflowPackages: parseWorkflowPackageSources(env[WORKFLOW_PACKAGE_SOURCES_ENV_KEY]),
  collisionPolicy: resolveCollisionPolicy(env[COLLISION_POLICY_ENV_KEY]),
  databaseUrl: env.DATABASE_URL,
});
