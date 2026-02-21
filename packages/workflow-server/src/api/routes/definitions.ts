import type { FastifyInstance } from 'fastify';

import type { WorkflowRegistration } from '../../registry/workflow-registry.js';
import type { TransitionEdge } from '../../read-models/run-tree-projection.js';
import { ApiError, type ApiServerDependencies } from '../server.js';
import { errorEnvelopeSchema, workflowDefinitionSchema } from '../schemas.js';

interface RuntimeWorkflowContext<I = unknown, O = unknown> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: unknown): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CO>(req: unknown): Promise<CO>;
  runCommand(req: unknown): Promise<unknown>;
  complete(output: O): void;
  fail(error: Error): void;
}

interface RuntimeWorkflowDefinition<I = unknown, O = unknown> {
  initialState: string;
  states: Record<
    string,
    (ctx: RuntimeWorkflowContext<I, O>, data?: unknown) => void | Promise<void>
  >;
  transitions?: readonly TransitionEdge[];
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
  const definition = registration.factory(
    createInspectionContext(registration.workflowType),
  ) as RuntimeWorkflowDefinition;

  return {
    states: Object.keys(definition.states),
    transitions: [...(definition.transitions ?? [])],
    childLaunchAnnotations: [],
  };
};

export const registerDefinitionRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.get(
    '/api/v1/workflows/definitions/:workflowType',
    {
      schema: {
        response: {
          200: workflowDefinitionSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const workflowType = (request.params as { workflowType: string }).workflowType;
      const registration = deps.registry.getByType(workflowType);

      if (registration) {
        const inspected = inspectRegistrationDefinition(registration);
        return workflowDefinitionSchema.parse({
          workflowType: registration.workflowType,
          workflowVersion: registration.workflowVersion,
          states: inspected.states,
          transitions: inspected.transitions,
          childLaunchAnnotations: inspected.childLaunchAnnotations,
          metadata: {
            ...(registration.metadata ?? {}),
            packageName: registration.packageName,
            packageVersion: registration.packageVersion,
            source: registration.source,
            sourceValue: registration.sourceValue,
          },
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
      return workflowDefinitionSchema.parse({
        workflowType: definition.workflow_type,
        workflowVersion: definition.workflow_version,
        states: [],
        transitions: [],
        childLaunchAnnotations: [],
        metadata: definition.metadata_jsonb,
      });
    },
  );
};
