import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import {
  countEventsForRun,
  createItxHarness,
  hasEventSequence,
  listEventTypesForRun,
} from './setup.js';

describe('itx.lifecycle.ITX-006', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.006',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'active',
            states: {
              active: () => {
                return;
              },
            },
          }),
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('collapses duplicate resume race to one logical resume transition', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.006',
      input: { race: true },
    });

    const pause = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${started.run.runId}/pause`,
      payload: {
        requestedBy: 'itx-006',
        reason: 'prepare-resume-race',
      },
    });
    expect(pause.statusCode).toBe(200);

    const [resumeOne, resumeTwo] = await Promise.all([
      harness.server.inject({
        method: 'POST',
        url: `/api/v1/workflows/runs/${started.run.runId}/resume`,
        payload: {
          requestedBy: 'itx-006',
          reason: 'race-a',
        },
      }),
      harness.server.inject({
        method: 'POST',
        url: `/api/v1/workflows/runs/${started.run.runId}/resume`,
        payload: {
          requestedBy: 'itx-006',
          reason: 'race-b',
        },
      }),
    ]);

    const statuses = [resumeOne.statusCode, resumeTwo.statusCode].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const summary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.run.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('running');

    const eventTypes = await listEventTypesForRun(harness, started.run.runId);
    expect(hasEventSequence(eventTypes, ['workflow.resuming', 'workflow.resumed'])).toBe(true);

    const resumedCount = await countEventsForRun(harness, {
      runId: started.run.runId,
      eventType: 'workflow.resumed',
    });
    expect(resumedCount).toBe(1);
  });
});
