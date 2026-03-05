import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Pool } from 'pg';

import type { Orchestrator } from '../orchestrator/orchestrator.js';
import type { ReconcileService } from '../recovery/reconcile-service.js';
import type { StartupReconcileController } from '../recovery/startup-reconcile.js';
import type { WorkflowRegistry } from '../registry/workflow-registry.js';
import { errorEnvelopeSchema, type ErrorEnvelope } from './schemas.js';
import { registerDefinitionRoutes } from './routes/definitions.js';
import { registerDiagnosticsRoutes } from './routes/diagnostics.js';
import { registerEventRoutes } from './routes/events.js';
import { registerHumanFeedbackRoutes } from './routes/human-feedback.js';
import { registerRunFeedbackRequestRoutes } from './routes/run-feedback-requests.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerWorkflowRoutes } from './routes/workflows.js';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
  }
}

export interface ApiServerDependencies {
  pool: Pool;
  orchestrator: Orchestrator;
  registry: WorkflowRegistry;
  reconcileService: ReconcileService;
  startupReconcile?: StartupReconcileController;
}

const toErrorEnvelope = (params: {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}): ErrorEnvelope => ({
  code: params.code,
  message: params.message,
  requestId: params.requestId,
  details: params.details,
});

export const createApiServer = async (deps: ApiServerDependencies): Promise<FastifyInstance> => {
  const server = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Composable Workflow API',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply.code(error.statusCode).send(
        errorEnvelopeSchema.parse(
          toErrorEnvelope({
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: request.id,
          }),
        ),
      );
      return;
    }

    if (error && typeof error === 'object' && 'validation' in error) {
      void reply.code(400).send(
        errorEnvelopeSchema.parse(
          toErrorEnvelope({
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: {
              issues: (error as { validation?: unknown }).validation,
            },
            requestId: request.id,
          }),
        ),
      );
      return;
    }

    void reply.code(500).send(
      errorEnvelopeSchema.parse(
        toErrorEnvelope({
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
          requestId: request.id,
        }),
      ),
    );
  });

  server.setNotFoundHandler((request, reply) => {
    void reply.code(404).send(
      errorEnvelopeSchema.parse(
        toErrorEnvelope({
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: request.id,
        }),
      ),
    );
  });

  await registerWorkflowRoutes(server, deps);
  await registerRunRoutes(server, deps);
  await registerRunFeedbackRequestRoutes(server, deps);
  await registerEventRoutes(server, deps);
  await registerDefinitionRoutes(server, deps);
  await registerHumanFeedbackRoutes(server, deps);
  await registerDiagnosticsRoutes(server);

  return server;
};
