import type { FastifyInstance } from 'fastify';

import {
  definitionSummarySchema,
  workflowDefinitionResponseSchema,
} from '@composable-workflow/workflow-api-types';

import type { WorkflowRegistration } from '../../registry/workflow-registry.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import { errorEnvelopeSchema, listDefinitionsResponseSchema } from '../schemas.js';
import type { RuntimeWorkflowContext } from '../../registry/runtime-types.js';

interface PersistedDefinitionRow {
  workflow_type: string;
  workflow_version: string;
  metadata_jsonb: Record<string, unknown> | null;
}

const createInspectionContext = (
  workflowType: string,
): RuntimeWorkflowContext<unknown, unknown> => ({
  runId: 'inspection-run',
  workflowType,
  input: undefined,
  now: () => new Date(),
  log: () => {
    return;
  },
  transition: () => {
    throw new Error('transition should not be called during definition inspection');
  },
  launchChild: async () => {
    throw new Error('launchChild should not be called during definition inspection');
  },
  runCommand: async () => {
    throw new Error('runCommand should not be called during definition inspection');
  },
  complete: () => {
    throw new Error('complete should not be called during definition inspection');
  },
  fail: () => {
    throw new Error('fail should not be called during definition inspection');
  },
});

export const inspectRegistrationDefinition = (registration: WorkflowRegistration) => {
  const definition = registration.factory(createInspectionContext(registration.workflowType));

  const metadataAnnotations = Array.isArray(registration.metadata?.childLaunchAnnotations)
    ? registration.metadata.childLaunchAnnotations.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === 'object',
      )
    : [];

  return {
    states: Object.keys(definition.states),
    transitions: [...(definition.transitions ?? [])],
    childLaunchAnnotations: metadataAnnotations,
  };
};

const normalizeDefinitionMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const buildRegistrationMetadata = (
  registration: WorkflowRegistration,
): Record<string, unknown> => ({
  ...(registration.metadata ?? {}),
  packageName: registration.packageName,
  packageVersion: registration.packageVersion,
  source: registration.source,
  sourceValue: registration.sourceValue,
});

const summarizeRegistrationDefinition = (registration: WorkflowRegistration) => {
  return definitionSummarySchema.parse({
    workflowType: registration.workflowType,
    workflowVersion: registration.workflowVersion,
    metadata: normalizeDefinitionMetadata(buildRegistrationMetadata(registration)),
  });
};

const summarizePersistedDefinition = (row: PersistedDefinitionRow) => {
  return definitionSummarySchema.parse({
    workflowType: row.workflow_type,
    workflowVersion: row.workflow_version,
    metadata: normalizeDefinitionMetadata(row.metadata_jsonb ?? {}),
  });
};

const listDefinitionSummaries = async (deps: ApiServerDependencies) => {
  const persistedDefinitions = await deps.pool.query<PersistedDefinitionRow>(
    `
SELECT workflow_type, workflow_version, metadata_jsonb
FROM workflow_definitions
ORDER BY workflow_type ASC
`,
  );

  const summaries = new Map<string, ReturnType<typeof summarizePersistedDefinition>>();

  for (const row of persistedDefinitions.rows) {
    summaries.set(row.workflow_type, summarizePersistedDefinition(row));
  }

  for (const registration of deps.registry.list()) {
    summaries.set(registration.workflowType, summarizeRegistrationDefinition(registration));
  }

  return [...summaries.values()].sort((left, right) =>
    left.workflowType.localeCompare(right.workflowType),
  );
};

const parseMetadataStates = (metadata: Record<string, unknown>): string[] => {
  const states = metadata.states;
  if (!Array.isArray(states)) {
    return [];
  }

  return states.filter((state): state is string => typeof state === 'string');
};

const parseMetadataTransitions = (
  metadata: Record<string, unknown>,
): Array<{ from: string; to: string; name?: string }> => {
  const transitions = metadata.transitions;
  if (!Array.isArray(transitions)) {
    return [];
  }

  return transitions.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const value = item as Record<string, unknown>;
    if (typeof value.from !== 'string' || typeof value.to !== 'string') {
      return [];
    }

    return [
      {
        from: value.from,
        to: value.to,
        name: typeof value.name === 'string' ? value.name : undefined,
      },
    ];
  });
};

const parseMetadataChildLaunchAnnotations = (
  metadata: Record<string, unknown>,
): Record<string, unknown>[] => {
  const annotations = metadata.childLaunchAnnotations;
  if (!Array.isArray(annotations)) {
    return [];
  }

  return annotations.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  );
};

export const registerDefinitionRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/workflows/definitions',
    {
      schema: {
        response: {
          200: listDefinitionsResponseSchema,
        },
      },
    },
    async () => {
      return listDefinitionsResponseSchema.parse({
        items: await listDefinitionSummaries(deps),
      });
    },
  );

  server.get(
    '/api/v1/workflows/definitions/:workflowType',
    {
      schema: {
        response: {
          200: workflowDefinitionResponseSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const workflowType = (request.params as { workflowType: string }).workflowType;
      const registration = deps.registry.getByType(workflowType);

      if (registration) {
        const inspected = inspectRegistrationDefinition(registration);
        return workflowDefinitionResponseSchema.parse({
          workflowType: registration.workflowType,
          workflowVersion: registration.workflowVersion,
          states: inspected.states,
          transitions: inspected.transitions,
          childLaunchAnnotations: inspected.childLaunchAnnotations,
          metadata: buildRegistrationMetadata(registration),
        });
      }

      const row = await deps.pool.query<{
        workflow_type: string;
        workflow_version: string;
        metadata_jsonb: Record<string, unknown>;
      }>(
        `
SELECT workflow_type, workflow_version, metadata_jsonb
FROM workflow_definitions
WHERE workflow_type = $1
`,
        [workflowType],
      );

      if (row.rowCount === 0) {
        throw new ApiError({
          statusCode: 404,
          code: 'DEFINITION_NOT_FOUND',
          message: `Workflow definition ${workflowType} not found`,
        });
      }

      const definition = row.rows[0];
      const metadata = definition.metadata_jsonb ?? {};
      return workflowDefinitionResponseSchema.parse({
        workflowType: definition.workflow_type,
        workflowVersion: definition.workflow_version,
        states: parseMetadataStates(metadata),
        transitions: parseMetadataTransitions(metadata),
        childLaunchAnnotations: parseMetadataChildLaunchAnnotations(metadata),
        metadata,
      });
    },
  );
};
