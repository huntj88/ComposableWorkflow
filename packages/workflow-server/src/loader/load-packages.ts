import type { Pool } from 'pg';

import type { WorkflowPackageSource, WorkflowTypeCollisionPolicy } from '../config.js';
import {
  createDefinitionRepository,
  type DefinitionRepository,
} from '../persistence/definition-repository.js';
import { withTransaction } from '../persistence/db.js';
import { WorkflowTypeCollisionError } from '../registry/errors.js';
import {
  createWorkflowRegistry,
  type WorkflowRegistration,
  type WorkflowRegistry,
} from '../registry/workflow-registry.js';
import {
  ManifestValidationError,
  type WorkflowPackageManifest,
  validateWorkflowPackageManifest,
} from './manifest-schema.js';
import { resolveWorkflowPackageSource } from './source-resolvers.js';

export interface LoaderLogger {
  info: (message: string, payload?: Record<string, unknown>) => void;
  warn: (message: string, payload?: Record<string, unknown>) => void;
}

export interface LoadedPackageDiagnostic {
  packageName: string;
  packageVersion: string;
  workflowTypes: string[];
  source: WorkflowPackageSource['source'];
  sourceValue: string;
}

export interface RejectedPackageDiagnostic {
  source: WorkflowPackageSource['source'];
  sourceValue: string;
  error: string;
}

export interface LoadWorkflowPackagesResult {
  registry: WorkflowRegistry;
  loaded: LoadedPackageDiagnostic[];
  rejected: RejectedPackageDiagnostic[];
}

export interface LoadWorkflowPackagesOptions {
  sources: WorkflowPackageSource[];
  collisionPolicy?: WorkflowTypeCollisionPolicy;
  registry?: WorkflowRegistry;
  pool?: Pool;
  definitionRepository?: DefinitionRepository;
  logger?: LoaderLogger;
  cwd?: string;
}

const sourcePriority: Record<WorkflowPackageSource['source'], number> = {
  path: 0,
  pnpm: 1,
  bundle: 2,
};

const defaultLogger: LoaderLogger = {
  info: (message, payload) => {
    console.info(message, payload ?? {});
  },
  warn: (message, payload) => {
    console.warn(message, payload ?? {});
  },
};

const readManifestExport = (moduleNamespace: Record<string, unknown>): unknown =>
  moduleNamespace.default ?? moduleNamespace.manifest ?? moduleNamespace.workflowPackageManifest;

const ensureNoRejectPolicyCollisions = (
  registry: WorkflowRegistry,
  manifest: WorkflowPackageManifest,
): void => {
  const seenTypes = new Set<string>();

  for (const workflow of manifest.workflows) {
    if (seenTypes.has(workflow.workflowType)) {
      throw new WorkflowTypeCollisionError({
        workflowType: workflow.workflowType,
        existingPackage: manifest.packageName,
        incomingPackage: manifest.packageName,
      });
    }

    const existing = registry.getByType(workflow.workflowType);

    if (existing) {
      throw new WorkflowTypeCollisionError({
        workflowType: workflow.workflowType,
        existingPackage: existing.packageName,
        incomingPackage: manifest.packageName,
      });
    }

    seenTypes.add(workflow.workflowType);
  }
};

const persistDefinitionsSnapshot = async (
  pool: Pool,
  definitionRepository: DefinitionRepository,
  registrations: WorkflowRegistration[],
): Promise<void> => {
  await withTransaction(pool, async (client) => {
    const now = new Date().toISOString();

    for (const registration of registrations) {
      await definitionRepository.upsertDefinition(client, {
        workflowType: registration.workflowType,
        workflowVersion: registration.workflowVersion,
        registeredAt: now,
        metadata: {
          packageName: registration.packageName,
          packageVersion: registration.packageVersion,
          source: registration.source,
          sourceValue: registration.sourceValue,
          ...registration.metadata,
        },
      });
    }
  });
};

export const loadWorkflowPackages = async (
  options: LoadWorkflowPackagesOptions,
): Promise<LoadWorkflowPackagesResult> => {
  const collisionPolicy = options.collisionPolicy ?? 'reject';
  const registry = options.registry ?? createWorkflowRegistry(collisionPolicy);
  const definitionRepository = options.definitionRepository ?? createDefinitionRepository();
  const logger = options.logger ?? defaultLogger;
  const loaded: LoadedPackageDiagnostic[] = [];
  const rejected: RejectedPackageDiagnostic[] = [];

  const orderedSources = [...options.sources].sort(
    (left, right) => sourcePriority[left.source] - sourcePriority[right.source],
  );

  for (const source of orderedSources) {
    try {
      const resolvedSource = await resolveWorkflowPackageSource(source, options.cwd);
      const moduleNamespace = (await import(resolvedSource.resolvedSpecifier)) as Record<
        string,
        unknown
      >;
      const manifest = validateWorkflowPackageManifest(
        readManifestExport(moduleNamespace),
        `${source.source}:${source.value}`,
      );

      if (collisionPolicy === 'reject') {
        ensureNoRejectPolicyCollisions(registry, manifest);
      }

      const registrations: WorkflowRegistration[] = manifest.workflows.map((workflow) => ({
        workflowType: workflow.workflowType,
        workflowVersion: workflow.workflowVersion,
        factory: workflow.factory,
        metadata: workflow.metadata,
        packageName: manifest.packageName,
        packageVersion: manifest.packageVersion,
        source: source.source,
        sourceValue: source.value,
      }));

      for (const registration of registrations) {
        registry.register(registration);
      }

      if (options.pool) {
        await persistDefinitionsSnapshot(options.pool, definitionRepository, registrations);
      }

      loaded.push({
        packageName: manifest.packageName,
        packageVersion: manifest.packageVersion,
        workflowTypes: manifest.workflows.map((workflow) => workflow.workflowType),
        source: source.source,
        sourceValue: source.value,
      });

      logger.info('Loaded workflow package', {
        packageName: manifest.packageName,
        packageVersion: manifest.packageVersion,
        workflowTypes: manifest.workflows.map((workflow) => workflow.workflowType),
        source: source.source,
        sourceValue: source.value,
      });
    } catch (error) {
      const reason =
        error instanceof ManifestValidationError
          ? `${error.message}: ${error.issues.map((issue) => issue.message).join(', ')}`
          : error instanceof WorkflowTypeCollisionError
            ? JSON.stringify(error.envelope)
            : error instanceof Error
              ? error.message
              : 'Unknown loader error';

      rejected.push({
        source: source.source,
        sourceValue: source.value,
        error: reason,
      });

      logger.warn('Rejected workflow package', {
        source: source.source,
        sourceValue: source.value,
        reason,
      });
    }
  }

  logger.info('Workflow package load summary', {
    loaded: loaded.length,
    rejected: rejected.length,
  });

  return {
    registry,
    loaded,
    rejected,
  };
};
