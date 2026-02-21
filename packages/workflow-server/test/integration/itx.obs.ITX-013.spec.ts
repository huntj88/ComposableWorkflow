import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  WorkflowEvent,
  WorkflowInstrumentation,
} from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.obs.ITX-013', () => {
  let harness: IntegrationHarness | undefined;
  const seenEvents: string[] = [];
  let sinkFailureCount = 0;

  const instrumentation: WorkflowInstrumentation = {
    onEvent: async (event: WorkflowEvent) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      seenEvents.push(`${event.sequence}:${event.eventType}`);

      if (event.sequence === 1) {
        sinkFailureCount += 1;
        throw new Error('simulated sink failure');
      }
    },
    onMetric: async () => {
      return;
    },
    onTrace: async () => {
      return;
    },
  };

  beforeAll(async () => {
    harness = await createItxHarness({
      adapters: {
        instrumentation,
      },
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.013',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: (ctx: { transition: (to: string) => void }) => {
                ctx.transition('done');
              },
              done: (ctx: { complete: (output: unknown) => void }) => {
                ctx.complete({ ok: true });
              },
            },
            transitions: [{ from: 'start', to: 'done', name: 'to-done' }],
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

  it('preserves ordered emission under backpressure and isolates telemetry failures from run state', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    seenEvents.length = 0;
    sinkFailureCount = 0;

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.013',
      input: {},
    });
    await harness.orchestrator.resumeRun(started.run.runId);

    const summary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.run.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('completed');

    const bySequence = [...seenEvents].sort((left, right) => {
      const leftSeq = Number(left.split(':')[0]);
      const rightSeq = Number(right.split(':')[0]);
      return leftSeq - rightSeq;
    });
    expect(seenEvents).toEqual(bySequence);
    expect(sinkFailureCount).toBe(1);
  });
});
