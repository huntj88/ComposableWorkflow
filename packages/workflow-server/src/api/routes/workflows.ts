import type { FastifyInstance } from 'fastify';

import { ApiError, type ApiServerDependencies } from '../server.js';
import { errorEnvelopeSchema, runSummarySchema, startWorkflowBodySchema } from '../schemas.js';
import { getRunSummaryById } from './runs.js';

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
          200: runSummarySchema,
          201: runSummarySchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const body = startWorkflowBodySchema.parse(request.body);

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

      const summary = await getRunSummaryById(deps, started.run.runId);
      if (!summary) {
        throw new ApiError({
          statusCode: 500,
          code: 'RUN_SUMMARY_MISSING',
          message: `Run ${started.run.runId} was created but could not be loaded`,
        });
      }

      const statusCode = started.created ? 201 : 200;
      return reply.code(statusCode).send(summary);
    },
  );
};
