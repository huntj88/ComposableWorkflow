import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  errorEnvelopeSchema,
  startWorkflowResponseSchema,
} from '@composable-workflow/workflow-api-types';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { createApiServer } from '../../../src/api/server.js';
import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';
import { createOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { createPool } from '../../../src/persistence/db.js';
import { createReconcileService } from '../../../src/recovery/reconcile-service.js';
import { createStartupReconcileController } from '../../../src/recovery/startup-reconcile.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

const parseErrorEnvelope = (payload: unknown) => errorEnvelopeSchema.parse(payload);

describe('api start and summary', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('supports start, summary, tree, list, and definitions contracts', async () => {
    const registry = createWorkflowRegistry();
    registry.register({
      workflowType: 'wf.api.simple',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            return;
          },
        },
        transitions: [{ from: 'start', to: 'done', name: 'complete' }],
      }),
      metadata: {
        displayName: 'Simple API Workflow',
      },
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

    const unknownStart = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.missing',
        input: {},
      },
    });
    expect(unknownStart.statusCode).toBe(404);
    const unknownEnvelope = parseErrorEnvelope(unknownStart.json());
    expect(unknownEnvelope.code).toBe('WORKFLOW_TYPE_NOT_FOUND');
    expect(unknownEnvelope.message).toContain('Unknown workflow type');
    expect(unknownEnvelope.requestId.length).toBeGreaterThan(0);
    expect(unknownEnvelope.details).toBeUndefined();

    const invalidStart = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: '   ',
        input: {},
      },
    });
    expect(invalidStart.statusCode).toBe(400);
    const invalidEnvelope = parseErrorEnvelope(invalidStart.json());
    expect(invalidEnvelope.code).toBe('VALIDATION_ERROR');
    expect(invalidEnvelope.message).toBe('Request validation failed');
    expect(invalidEnvelope.requestId.length).toBeGreaterThan(0);
    expect(Array.isArray(invalidEnvelope.details?.issues)).toBe(true);

    try {
      const startPayload = {
        workflowType: 'wf.api.simple',
        input: { key: 'value' },
        idempotencyKey: 'idem-start-and-summary',
      };
      const startResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/start',
        payload: startPayload,
      });

      expect(startResponse.statusCode).toBe(201);
      const started = startWorkflowResponseSchema.parse(startResponse.json());
      expect(started.workflowType).toBe('wf.api.simple');
      expect(started.lifecycle).toBe('running');
      expect(typeof started.startedAt).toBe('string');

      const duplicateStart = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/start',
        payload: startPayload,
      });
      expect(duplicateStart.statusCode).toBe(200);
      const duplicate = startWorkflowResponseSchema.parse(duplicateStart.json());
      expect(duplicate).toEqual(started);

      const summaryResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}`,
      });
      expect(summaryResponse.statusCode).toBe(200);
      const summary = summaryResponse.json();
      expect(summary.runId).toBe(started.runId);

      const treeResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}/tree`,
      });
      expect(treeResponse.statusCode).toBe(200);
      expect(treeResponse.json().tree.runId).toBe(started.runId);

      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs?lifecycle=running&workflowType=wf.api.simple',
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().items).toHaveLength(1);

      const definitionResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions/wf.api.simple',
      });
      expect(definitionResponse.statusCode).toBe(200);
      const definition = definitionResponse.json();
      expect(definition.states).toContain('start');
      expect(definition.transitions).toEqual([{ from: 'start', to: 'done', name: 'complete' }]);

      const logsResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/workflows/runs/${started.runId}/logs`,
      });
      expect(logsResponse.statusCode).toBe(200);
      expect(logsResponse.json().items).toEqual([]);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
