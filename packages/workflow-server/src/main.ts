import { bootstrapWorkflowServer } from './bootstrap.js';

const DEFAULT_PORT = 3000;

const resolvePort = (): number => {
  const rawPort = process.env.WORKFLOW_SERVER_PORT;
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid WORKFLOW_SERVER_PORT value: ${rawPort}`);
  }

  return parsed;
};

const run = async (): Promise<void> => {
  const port = resolvePort();
  const runtime = await bootstrapWorkflowServer({
    initializePersistence: true,
    startupReconcile: true,
  });

  const address = await runtime.server.listen({
    host: '0.0.0.0',
    port,
  });

  console.info(`[workflow-server] startup complete on ${address}`);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.info(`[workflow-server] shutdown requested (${signal})`);

    try {
      await runtime.shutdown();
      console.info('[workflow-server] shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[workflow-server] shutdown failed', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

run().catch((error) => {
  console.error('[workflow-server] startup failed', error);
  process.exit(1);
});
