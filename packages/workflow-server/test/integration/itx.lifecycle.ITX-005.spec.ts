import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import {
  countEventsForRun,
  createDeferred,
  createItxHarness,
  hasEventSequence,
  listEventTypesForRun,
} from './setup.js';

describe('itx.lifecycle.ITX-005', () => {
  let harness: IntegrationHarness | undefined;
  let enteredState = createDeferred<void>();
  let continueState = createDeferred<void>();

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.005',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: {
                runCommand: (request: unknown) => Promise<unknown>;
                complete: (output: unknown) => void;
              }) => {
                enteredState.resolve();
                await continueState.promise;
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'process.stdout.write("itx-005")'],
                  cwd: process.cwd(),
                });
                ctx.complete({ ok: true });
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

  it('enforces pause terminalization only at safe points with no partial transition commit', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    enteredState = createDeferred<void>();
    continueState = createDeferred<void>();

    const started = await harness.orchestrator.startRun({
      workflowType: 'wf.itx.005',
      input: { safePoint: true },
    });

    const runner = harness.orchestrator.resumeRun(started.run.runId);
    await enteredState.promise;

    const pauseResponse = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${started.run.runId}/pause`,
      payload: {
        requestedBy: 'itx-005',
        reason: 'pause-during-transition',
      },
    });

    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.json().lifecycle).toBe('pausing');

    const pausedDuringHandler = await harness.db.pool.query<{ lifecycle: string }>(
      'SELECT lifecycle FROM workflow_runs WHERE run_id = $1',
      [started.run.runId],
    );
    expect(pausedDuringHandler.rows[0]?.lifecycle).toBe('pausing');

    const committedCommandsBeforeSafePoint = await countEventsForRun(harness, {
      runId: started.run.runId,
      eventType: 'command.started',
    });
    expect(committedCommandsBeforeSafePoint).toBe(0);

    continueState.resolve();
    await runner;

    const summary = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${started.run.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('paused');

    const eventTypes = await listEventTypesForRun(harness, started.run.runId);
    expect(hasEventSequence(eventTypes, ['workflow.pausing', 'workflow.paused'])).toBe(true);

    const pausedCount = await countEventsForRun(harness, {
      runId: started.run.runId,
      eventType: 'workflow.paused',
    });
    expect(pausedCount).toBe(1);
  });
});
