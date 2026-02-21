import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { withTransaction, createPool } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

interface StreamFrame {
  event: string;
  id: string;
  data: {
    sequence: number;
    eventType: string;
    runId: string;
  };
}

const collectStreamFrames = async (url: string, expectedCount: number): Promise<StreamFrame[]> => {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: {
      Accept: 'text/event-stream',
    },
    signal: controller.signal,
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const frames: StreamFrame[] = [];
  const reader = response.body?.getReader();
  expect(reader).toBeTruthy();

  const decoder = new TextDecoder();
  let buffer = '';

  while (frames.length < expectedCount) {
    const chunk = await reader!.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });

    while (buffer.includes('\n\n')) {
      const separatorIndex = buffer.indexOf('\n\n');
      const rawFrame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      if (!rawFrame || rawFrame.startsWith(':')) {
        continue;
      }

      const lines = rawFrame.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const idLine = lines.find((line) => line.startsWith('id: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));

      if (!eventLine || !idLine || !dataLine) {
        continue;
      }

      frames.push({
        event: eventLine.slice('event: '.length),
        id: idLine.slice('id: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)) as StreamFrame['data'],
      });

      if (frames.length >= expectedCount) {
        controller.abort();
        break;
      }
    }
  }

  return frames;
};

describe('stream sse ordering and reconnect', () => {
  let container: StartedTestContainer | undefined;
  let databaseUrl: string;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'workflow',
          POSTGRES_USER: 'workflow',
          POSTGRES_PASSWORD: 'workflow',
        })
        .withExposedPorts(5432)
        .start();

      databaseUrl = `postgresql://workflow:workflow@${container.getHost()}:${container.getMappedPort(5432)}/workflow`;
      await runMigrations({ databaseUrl, direction: 'up' });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('streams ordered events and reconnects without losing events', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.api.stream',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            return;
          },
        },
      }),
      packageName: 'test-package',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const pool = createPool({ connectionString: databaseUrl });
    const lockProvider = new InMemoryLockProvider();
    const orchestrator = createOrchestrator({
      pool,
      registry,
      lockProvider,
    });
    const reconcileService = createReconcileService({
      pool,
      lockProvider,
      orchestrator,
    });
    const startupReconcile = createStartupReconcileController(reconcileService);
    const server = await createApiServer({
      pool,
      orchestrator,
      registry,
      reconcileService,
      startupReconcile,
    });
    const eventRepository = createEventRepository();

    try {
      const started = await orchestrator.startRun({
        workflowType: 'wf.api.stream',
        input: { test: true },
      });

      await Promise.all(
        Array.from({ length: 5 }).map((_, index) =>
          withTransaction(pool, async (client) => {
            await eventRepository.appendEvent(client, {
              eventId: `evt-stream-initial-${index + 1}`,
              runId: started.run.runId,
              eventType: 'log',
              timestamp: new Date(1_770_000_100_000 + index).toISOString(),
              payload: {
                index,
                message: `initial-${index}`,
              },
            });
          }),
        ),
      );

      const listenAddress = await server.listen({
        host: '127.0.0.1',
        port: 0,
      });

      const firstBatchPromise = collectStreamFrames(
        `${listenAddress}/api/v1/workflows/runs/${started.run.runId}/stream?eventType=log`,
        4,
      );

      const firstBatch = await firstBatchPromise;
      expect(firstBatch).toHaveLength(4);
      expect(firstBatch.every((frame) => frame.event === 'workflow-event')).toBe(true);

      const firstBatchSequences = firstBatch.map((frame) => frame.data.sequence);
      expect(firstBatchSequences).toEqual(
        [...firstBatchSequences].sort((left, right) => left - right),
      );

      const reconnectCursor = firstBatch.at(-1)?.id;
      expect(reconnectCursor).toBeTruthy();

      await Promise.all(
        Array.from({ length: 2 }).map((_, index) =>
          withTransaction(pool, async (client) => {
            await eventRepository.appendEvent(client, {
              eventId: `evt-stream-reconnect-${index + 1}`,
              runId: started.run.runId,
              eventType: 'log',
              timestamp: new Date(1_770_000_101_000 + index).toISOString(),
              payload: {
                index: 100 + index,
                message: `reconnect-${index}`,
              },
            });
          }),
        ),
      );

      const secondBatch = await collectStreamFrames(
        `${listenAddress}/api/v1/workflows/runs/${started.run.runId}/stream?eventType=log&cursor=${encodeURIComponent(reconnectCursor!)}`,
        3,
      );

      expect(secondBatch).toHaveLength(3);
      const secondBatchSequences = secondBatch.map((frame) => frame.data.sequence);
      expect(secondBatchSequences).toEqual(
        [...secondBatchSequences].sort((left, right) => left - right),
      );

      const firstLast = firstBatchSequences.at(-1);
      const secondFirst = secondBatchSequences[0];
      expect(firstLast).toBeDefined();
      expect(secondFirst).toBeGreaterThan(firstLast!);

      const merged = [...firstBatchSequences, ...secondBatchSequences];
      expect(new Set(merged).size).toBe(merged.length);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
