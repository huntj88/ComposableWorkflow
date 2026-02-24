import type { FastifyInstance } from 'fastify';

import { ApiError, type ApiServerDependencies } from '../server.js';
import {
  errorEnvelopeSchema,
  startWorkflowBodySchema,
  startWorkflowResponseSchema,
} from '../schemas.js';

export const registerWorkflowRoutes = async (
  server: FastifyInstance,
  deps: ApiServerDependencies,
): Promise<void> => {
  server.post(
    '/api/v1/workflows/start',
    {
      schema: {
        body: startWorkflowBodySchema,
        response: {
          200: startWorkflowResponseSchema,
          201: startWorkflowResponseSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const body = startWorkflowBodySchema.parse(request.body);

      if (deps.startupReconcile) {
        await deps.startupReconcile.waitUntilReady();
      }

      let started;
      try {
        started = await deps.orchestrator.startRun({
          workflowType: body.workflowType,
          input: body.input,
          idempotencyKey: body.idempotencyKey,
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Unknown workflow type')) {
          throw new ApiError({
            statusCode: 404,
            code: 'WORKFLOW_TYPE_NOT_FOUND',
            message: error.message,
          });
        }

        throw error;
      }

      const statusCode = started.created ? 201 : 200;
      return reply.code(statusCode).send({
        runId: started.run.runId,
        workflowType: started.run.workflowType,
        workflowVersion: started.run.workflowVersion,
        lifecycle: 'running',
        startedAt: started.run.startedAt,
      });
    },
  );
};
