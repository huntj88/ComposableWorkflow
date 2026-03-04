import type { FastifyInstance } from 'fastify';

import { z } from 'zod';

const diagnosticsResponseSchema = z.object({
  copilotFixtureMode: z.boolean(),
});

export const registerDiagnosticsRoutes = async (server: FastifyInstance): Promise<void> => {
  server.get(
    '/api/v1/diagnostics',
    {
      schema: {
        response: {
          200: diagnosticsResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      void reply.code(200).send({
        copilotFixtureMode: Boolean(process.env.COPILOT_FIXTURE_DIR),
      });
    },
  );
};
