import { z } from 'zod';

import {
  defaultCommandPolicy,
  normalizeCommandPolicy,
  type CommandPolicy,
} from './command/command-policy.js';

export const COLLISION_POLICY_ENV_KEY = 'WORKFLOW_TYPE_COLLISION_POLICY';
export const WORKFLOW_PACKAGE_SOURCES_ENV_KEY = 'WORKFLOW_PACKAGE_SOURCES';
export const WORKFLOW_COMMAND_POLICY_ENV_KEY = 'WORKFLOW_COMMAND_POLICY';

export const workflowPackageSourceSchema = z.object({
  source: z.enum(['path', 'pnpm', 'bundle']),
  value: z.string().trim().min(1),
});

export type WorkflowPackageSource = z.infer<typeof workflowPackageSourceSchema>;

export type WorkflowTypeCollisionPolicy = 'reject' | 'override';

export interface WorkflowServerConfig {
  workflowPackages: WorkflowPackageSource[];
  collisionPolicy: WorkflowTypeCollisionPolicy;
  commandPolicy: CommandPolicy;
  databaseUrl?: string;
}

const commandPolicyOverrideSchema = z.object({
  allowCommands: z.array(z.string().trim().min(1)).optional(),
  denyCommands: z.array(z.string().trim().min(1)).optional(),
  allowedCwdPrefixes: z.array(z.string().trim().min(1)).optional(),
  blockedEnvKeys: z.array(z.string().trim().min(1)).optional(),
  timeoutMsMax: z.number().int().positive().optional(),
  outputMaxBytes: z.number().int().positive().optional(),
  redactFields: z.array(z.string().trim().min(1)).optional(),
});

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

export const resolveCommandPolicy = (
  rawPolicy = process.env[WORKFLOW_COMMAND_POLICY_ENV_KEY],
): CommandPolicy => {
  const defaults = defaultCommandPolicy();

  if (!rawPolicy) {
    return defaults;
  }

  const parsed = commandPolicyOverrideSchema.parse(JSON.parse(rawPolicy) as unknown);
  return normalizeCommandPolicy({
    ...defaults,
    ...parsed,
  });
};

export const loadServerConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): WorkflowServerConfig => ({
  workflowPackages: parseWorkflowPackageSources(env[WORKFLOW_PACKAGE_SOURCES_ENV_KEY]),
  collisionPolicy: resolveCollisionPolicy(env[COLLISION_POLICY_ENV_KEY]),
  commandPolicy: resolveCommandPolicy(env[WORKFLOW_COMMAND_POLICY_ENV_KEY]),
  databaseUrl: env.DATABASE_URL,
});
