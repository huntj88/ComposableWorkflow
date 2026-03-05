import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import {
  runEventsResponseSchema,
  runSummaryResponseSchema,
  workflowDefinitionResponseSchema,
  workflowStreamFrameSchema,
  type WorkflowEventDto,
} from '@composable-workflow/workflow-api-types';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { withTransaction, createPool } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

interface StreamFrame {
  event: 'workflow-event';
  id: string;
  data: WorkflowEventDto;
}

interface DefinitionGraph {
  workflowType: string;
  workflowVersion: string;
  states: string[];
  transitions: Array<{ from: string; to: string; name?: string }>;
}

interface OverlaySnapshot {
  activeState: string;
  traversedTransitionIds: string[];
  failedTransitionIds: string[];
}

const collectStreamFrames = async (params: {
  url: string;
  expectedCount: number;
}): Promise<StreamFrame[]> => {
  const controller = new AbortController();
  const response = await fetch(params.url, {
    headers: {
      Accept: 'text/event-stream',
    },
    signal: controller.signal,
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const reader = response.body?.getReader();
  expect(reader).toBeTruthy();

  const frames: StreamFrame[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  while (frames.length < params.expectedCount) {
    const chunk = await reader!.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });

    while (buffer.includes('\n\n')) {
      const separator = buffer.indexOf('\n\n');
      const rawFrame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);

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

      const parsed = workflowStreamFrameSchema.parse({
        event: eventLine.slice('event: '.length),
        id: idLine.slice('id: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)) as unknown,
      });

      frames.push(parsed as StreamFrame);
      if (frames.length >= params.expectedCount) {
        controller.abort();
        break;
      }
    }
  }

  return frames;
};

const transitionPairKey = (from: string, to: string): string => `${from}=>${to}`;

const buildTransitionIdentity = (definition: DefinitionGraph): Map<string, string[]> => {
  const byPair = new Map<string, string[]>();
  const ordinals = new Map<string, number>();

  for (const transition of definition.transitions) {
    const pair = transitionPairKey(transition.from, transition.to);
    const ordinalWithinPair = ordinals.get(pair) ?? 0;
    ordinals.set(pair, ordinalWithinPair + 1);

    const transitionId = `${definition.workflowType}::edge::${transition.from}::${transition.to}::${ordinalWithinPair}`;
    const key = `${pair}::${transition.name ?? ''}`;
    const existing = byPair.get(key) ?? [];
    byPair.set(key, [...existing, transitionId]);
  }

  return byPair;
};

const resolveTransitionId = (
  definition: DefinitionGraph,
  transition: { from?: string; to?: string; name?: string } | null,
): string => {
  if (!transition?.from || !transition.to) {
    throw new Error('Contract violation: transition reference missing from/to identifiers');
  }

  const byPair = buildTransitionIdentity(definition);
  const withName =
    byPair.get(`${transitionPairKey(transition.from, transition.to)}::${transition.name ?? ''}`) ??
    [];

  if (withName.length > 0) {
    return withName[0];
  }

  const fallback = byPair.get(`${transitionPairKey(transition.from, transition.to)}::`) ?? [];
  if (fallback.length > 0) {
    return fallback[0];
  }

  throw new Error(
    `Contract violation: unknown transition reference ${transition.from}->${transition.to}`,
  );
};

const reconstructOverlay = (params: {
  definition: DefinitionGraph;
  currentState: string;
  events: WorkflowEventDto[];
}): OverlaySnapshot => {
  const stateSet = new Set(params.definition.states);
  if (!stateSet.has(params.currentState)) {
    throw new Error(
      `Contract violation: RunSummaryResponse.currentState ${params.currentState} is not in definition`,
    );
  }

  const traversed = new Set<string>();
  const failed = new Set<string>();
  let activeState = params.currentState;

  const ordered = [...params.events].sort((left, right) => left.sequence - right.sequence);
  for (const event of ordered) {
    if (event.eventType === 'state.entered') {
      const stateId =
        typeof event.payload?.state === 'string'
          ? event.payload.state
          : typeof event.state === 'string'
            ? event.state
            : null;

      if (!stateId || !stateSet.has(stateId)) {
        throw new Error(`Contract violation: unknown state reference ${stateId ?? '(missing)'}`);
      }

      activeState = stateId;
      continue;
    }

    if (event.eventType === 'transition.completed') {
      const transitionId = resolveTransitionId(params.definition, event.transition);
      traversed.add(transitionId);
      continue;
    }

    if (event.eventType === 'transition.failed') {
      const transitionId = resolveTransitionId(params.definition, event.transition);
      failed.add(transitionId);
    }
  }

  return {
    activeState,
    traversedTransitionIds: [...traversed].sort((left, right) => left.localeCompare(right)),
    failedTransitionIds: [...failed].sort((left, right) => left.localeCompare(right)),
  };
};

const fetchAllEventsByCursor = async (params: {
  inject: (request: {
    method: 'GET';
    url: string;
  }) => Promise<{ statusCode: number; json: () => unknown }>;
  runId: string;
  limit: number;
}): Promise<WorkflowEventDto[]> => {
  const items: WorkflowEventDto[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = cursor
      ? `/api/v1/workflows/runs/${params.runId}/events?limit=${params.limit}&cursor=${encodeURIComponent(cursor)}`
      : `/api/v1/workflows/runs/${params.runId}/events?limit=${params.limit}`;

    const response = await params.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);

    const parsed = runEventsResponseSchema.parse(response.json());
    items.push(...parsed.items);

    if (!parsed.nextCursor) {
      return items;
    }

    cursor = parsed.nextCursor;
  }
};

describe('graph overlay reference conformance', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('B-API-010 resolves runtime references against static definition IDs and reconstructs deterministically across pagination and stream resume', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.graph.overlay',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'queued',
        states: {
          queued: () => {
            return;
          },
          running: () => {
            return;
          },
          completed: () => {
            return;
          },
          failed: () => {
            return;
          },
        },
        transitions: [
          { from: 'queued', to: 'running', name: 'dispatch' },
          { from: 'running', to: 'completed', name: 'finish' },
          { from: 'running', to: 'failed', name: 'fail-path' },
        ],
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
        workflowType: 'wf.graph.overlay',
        input: { test: true },
      });

      await withTransaction(pool, async (client) => {
        await eventRepository.appendEvent(client, {
          eventId: 'evt-overlay-transition-completed',
          runId: started.run.runId,
          eventType: 'transition.completed',
          timestamp: new Date('2026-03-01T00:00:00.000Z').toISOString(),
          payload: {
            from: 'queued',
            to: 'running',
            name: 'dispatch',
          },
        });

        await eventRepository.appendEvent(client, {
          eventId: 'evt-overlay-state-entered',
          runId: started.run.runId,
          eventType: 'state.entered',
          timestamp: new Date('2026-03-01T00:00:01.000Z').toISOString(),
          payload: {
            state: 'running',
          },
        });

        await eventRepository.appendEvent(client, {
          eventId: 'evt-overlay-transition-failed',
          runId: started.run.runId,
          eventType: 'transition.failed',
          timestamp: new Date('2026-03-01T00:00:02.000Z').toISOString(),
          payload: {
            from: 'running',
            to: 'failed',
            name: 'fail-path',
          },
          error: {
            code: 'TEST_FAILURE',
          },
        });
      });

      const definitionResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions/wf.graph.overlay',
      });
      expect(definitionResponse.statusCode).toBe(200);

      const definition = workflowDefinitionResponseSchema.parse(definitionResponse.json());

      const summaryResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}`,
      });
      expect(summaryResponse.statusCode).toBe(200);

      const summary = runSummaryResponseSchema.parse(summaryResponse.json());
      expect(summary.workflowType).toBe(definition.workflowType);
      expect(summary.workflowVersion).toBe(definition.workflowVersion);
      expect(definition.states).toContain(summary.currentState);

      const pagedEvents = await fetchAllEventsByCursor({
        inject: (request) => server.inject(request),
        runId: started.run.runId,
        limit: 2,
      });

      const overlayFromPaged = reconstructOverlay({
        definition,
        currentState: summary.currentState,
        events: pagedEvents,
      });

      const address = await server.listen({
        host: '127.0.0.1',
        port: 0,
      });

      const firstBatchCount = Math.min(2, pagedEvents.length);
      const firstBatch = await collectStreamFrames({
        url: `${address}/api/v1/workflows/runs/${started.run.runId}/stream`,
        expectedCount: firstBatchCount,
      });

      const reconnectCursor = firstBatch.at(-1)?.id;
      expect(reconnectCursor).toBeTruthy();

      const secondBatch = await collectStreamFrames({
        url: `${address}/api/v1/workflows/runs/${started.run.runId}/stream?cursor=${encodeURIComponent(reconnectCursor!)}`,
        expectedCount: pagedEvents.length - firstBatchCount,
      });

      const streamedEvents = [...firstBatch, ...secondBatch].map((frame) => frame.data);
      expect(streamedEvents.map((event) => event.sequence)).toEqual(
        pagedEvents.map((event) => event.sequence),
      );

      const overlayFromStream = reconstructOverlay({
        definition,
        currentState: summary.currentState,
        events: streamedEvents,
      });

      expect(overlayFromStream).toEqual(overlayFromPaged);
    } finally {
      await server.close();
      await pool.end();
    }
  });

  it('surfaces explicit contract violations for unknown state and transition references', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.graph.overlay.negative',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'queued',
        states: {
          queued: () => {
            return;
          },
          running: () => {
            return;
          },
        },
        transitions: [{ from: 'queued', to: 'running', name: 'dispatch' }],
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
        workflowType: 'wf.graph.overlay.negative',
        input: { test: true },
      });

      await withTransaction(pool, async (client) => {
        await eventRepository.appendEvent(client, {
          eventId: 'evt-overlay-negative-state',
          runId: started.run.runId,
          eventType: 'state.entered',
          timestamp: new Date('2026-03-01T00:00:03.000Z').toISOString(),
          payload: {
            state: 'ghost',
          },
        });
      });

      const definitionResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions/wf.graph.overlay.negative',
      });
      expect(definitionResponse.statusCode).toBe(200);
      const definition = workflowDefinitionResponseSchema.parse(definitionResponse.json());

      const summaryResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}`,
      });
      expect(summaryResponse.statusCode).toBe(200);
      const summary = runSummaryResponseSchema.parse(summaryResponse.json());

      const eventsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/events?limit=50`,
      });
      expect(eventsResponse.statusCode).toBe(200);
      const stateViolationEvents = runEventsResponseSchema.parse(eventsResponse.json()).items;

      expect(() =>
        reconstructOverlay({
          definition,
          currentState: summary.currentState,
          events: stateViolationEvents,
        }),
      ).toThrow(/unknown state reference/u);

      await withTransaction(pool, async (client) => {
        await eventRepository.appendEvent(client, {
          eventId: 'evt-overlay-negative-transition',
          runId: started.run.runId,
          eventType: 'transition.failed',
          timestamp: new Date('2026-03-01T00:00:04.000Z').toISOString(),
          payload: {
            from: 'ghost',
            to: 'void',
            name: 'missing-edge',
          },
          error: {
            code: 'TEST_UNKNOWN_TRANSITION',
          },
        });
      });

      const transitionOnlyResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.run.runId}/events?eventType=transition.failed&limit=50`,
      });
      expect(transitionOnlyResponse.statusCode).toBe(200);

      const transitionViolationEvents = runEventsResponseSchema.parse(
        transitionOnlyResponse.json(),
      ).items;

      expect(() =>
        reconstructOverlay({
          definition,
          currentState: summary.currentState,
          events: transitionViolationEvents,
        }),
      ).toThrow(/unknown transition reference/u);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
