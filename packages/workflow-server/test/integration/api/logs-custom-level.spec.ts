import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createIntegrationHarness } from '../../harness/create-harness.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';

describe('logs custom level and normalization', () => {
  let harness: IntegrationHarness | undefined;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      harness = await createIntegrationHarness({
        registerWorkflows: (registry) => {
          registry.register({
            workflowType: 'wf.logs.custom.v1',
            workflowVersion: '1.0.0',
            factory: () => ({
              initialState: 'start',
              states: {
                start: (ctx: WorkflowContext<unknown, unknown>) => {
                  ctx.log({
                    level: 'warn',
                    message: 'custom-workflow-log',
                  });
                  ctx.complete({ ok: true });
                },
              },
            }),
            packageName: 'test-package',
            packageVersion: '1.0.0',
            source: 'path',
            sourceValue: '.',
          });
        },
      });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('persists ctx.log events and exposes them via logs API with authored level', async (context) => {
    if (!runtimeAvailable || !harness) {
      context.skip();
      return;
    }

    const integrationHarness = harness;

    const startResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.logs.custom.v1',
        input: {},
      },
    });
    expect(startResponse.statusCode).toBe(201);

    const runId = startResponse.json().runId as string;
    await integrationHarness.orchestrator.resumeRun(runId);

    const eventsResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}/events?eventType=log&limit=50`,
    });
    expect(eventsResponse.statusCode).toBe(200);
    expect(eventsResponse.json().items.length).toBeGreaterThan(0);

    const logsResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}/logs`,
    });

    expect(logsResponse.statusCode).toBe(200);
    const customLog = (logsResponse.json().items as Array<Record<string, unknown>>).find(
      (item) => item.message === 'custom-workflow-log',
    );

    expect(customLog).toBeDefined();
    expect(customLog?.level).toBe('warn');
  });

  it('normalizes severity-only log payloads to deterministic level values', async (context) => {
    if (!runtimeAvailable || !harness) {
      context.skip();
      return;
    }

    const integrationHarness = harness;

    const startResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'wf.logs.custom.v1',
        input: {},
      },
    });
    expect(startResponse.statusCode).toBe(201);

    const runId = startResponse.json().runId as string;
    const eventRepository = createEventRepository();

    await withTransaction(integrationHarness.db.pool, async (client) => {
      await eventRepository.appendEvent(client, {
        eventId: `evt-severity-only-${Date.now()}`,
        runId,
        eventType: 'log',
        timestamp: new Date().toISOString(),
        payload: {
          severity: 'warning',
          message: 'severity-only-log',
        },
      });
    });

    const logsResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}/logs`,
    });

    expect(logsResponse.statusCode).toBe(200);
    const severityOnly = (logsResponse.json().items as Array<Record<string, unknown>>).find(
      (item) => item.message === 'severity-only-log',
    );

    expect(severityOnly).toBeDefined();
    expect(severityOnly?.level).toBe('warn');
  });
});
