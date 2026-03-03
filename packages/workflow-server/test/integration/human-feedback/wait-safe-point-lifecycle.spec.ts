import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('human feedback wait safe-point lifecycle behavior', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  const createParentRun = async (runId: string): Promise<RunSummary> => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const runRepository = createRunRepository();

    return withTransaction(harness.db.pool, (client) =>
      runRepository.upsertRunSummary(client, {
        runId,
        workflowType: 'wf.test.parent',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'collect_feedback',
        parentRunId: null,
        startedAt: '2026-03-01T00:00:00.000Z',
        endedAt: null,
      }),
    );
  };

  const launchAwaitingFeedbackRun = async (feedbackRunId: string) => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const parentRun = await createParentRun(`wr_parent_${feedbackRunId}`);
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();

    return withTransaction(integrationHarness.db.pool, async (client) =>
      launchChild({
        client,
        deps: {
          registry: integrationHarness.registry,
          runRepository,
          eventRepository,
          humanFeedbackProjectionRepository: projectionRepository,
          idempotencyRepository,
          now: () => new Date('2026-03-01T00:01:00.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_wait_lifecycle_${feedbackRunId}_${++sequence}`;
          })(),
          runIdFactory: () => feedbackRunId,
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'Wait for explicit response',
            questionId: 'q_wait_1',
            options: [
              { id: 1, label: 'Continue' },
              { id: 2, label: 'Stop' },
            ],
            requestedByRunId: parentRun.runId,
            requestedByWorkflowType: parentRun.workflowType,
            requestedByState: parentRun.currentState,
          },
        },
      }),
    );
  };

  it('does not timeout while awaiting response and supports pause/resume/cancel transitions', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const launched = await launchAwaitingFeedbackRun('wr_feedback_wait_no_timeout');

    const beforeControl = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}`,
    });
    expect(beforeControl.statusCode).toBe(200);
    expect(beforeControl.json().status).toBe('awaiting_response');

    const pauseResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${launched.childRun.runId}/pause`,
      payload: {},
    });
    expect(pauseResponse.statusCode).toBe(200);

    const pausedSummary = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${launched.childRun.runId}`,
    });
    expect(pausedSummary.statusCode).toBe(200);
    expect(pausedSummary.json().lifecycle).toBe('paused');

    const resumeResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${launched.childRun.runId}/resume`,
      payload: {},
    });
    expect(resumeResponse.statusCode).toBe(200);

    const afterResume = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}`,
    });
    expect(afterResume.statusCode).toBe(200);
    expect(afterResume.json().status).toBe('awaiting_response');

    const cancelResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: `/api/v1/workflows/runs/${launched.childRun.runId}/cancel`,
      payload: {},
    });
    expect(cancelResponse.statusCode).toBe(200);

    const afterCancel = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}`,
    });
    expect(afterCancel.statusCode).toBe(200);
    expect(afterCancel.json().status).toBe('cancelled');
    expect(afterCancel.json().cancelledAt).toBeTruthy();
  });

  it('recovers interrupted feedback waits without terminalizing pending requests', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const launched = await launchAwaitingFeedbackRun('wr_feedback_wait_recovery');
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();
    const feedbackInput = {
      prompt: 'Wait for explicit response',
      questionId: 'q_wait_1',
      options: [
        { id: 1, label: 'Continue' },
        { id: 2, label: 'Stop' },
      ],
      requestedByRunId: `wr_parent_${launched.childRun.runId}`,
      requestedByWorkflowType: 'wf.test.parent',
      requestedByState: 'collect_feedback',
    };

    await integrationHarness.db.pool.query(
      'UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1',
      [launched.childRun.runId, 'recovering'],
    );

    await withTransaction(integrationHarness.db.pool, async (client) => {
      const run = await runRepository.getRunSummary(client, launched.childRun.runId);
      if (!run) {
        throw new Error('Expected feedback run summary to exist');
      }

      await runTransitionStep({
        client,
        deps: {
          registry: integrationHarness.registry,
          runRepository,
          eventRepository,
          humanFeedbackProjectionRepository: projectionRepository,
          idempotencyRepository,
          now: () => new Date('2026-03-01T00:05:00.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_feedback_recovery_step_${++sequence}`;
          })(),
        },
        run,
        input: feedbackInput,
      });
    });

    const summary = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${launched.childRun.runId}`,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().lifecycle).toBe('running');

    const feedbackStatus = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}`,
    });
    expect(feedbackStatus.statusCode).toBe(200);
    expect(feedbackStatus.json().status).toBe('awaiting_response');

    const receivedEvents = await integrationHarness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'human-feedback.received'",
      [launched.childRun.runId],
    );
    expect(receivedEvents.rows[0]?.count).toBe(0);
  });
});
