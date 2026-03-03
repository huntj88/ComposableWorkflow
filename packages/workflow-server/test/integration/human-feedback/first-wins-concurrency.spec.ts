import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('human feedback first-wins concurrency', () => {
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

  it('accepts only the first response and rejects racing submissions with 409', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const parentRun = await createParentRun('wr_parent_feedback_race');
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();

    const launched = await withTransaction(integrationHarness.db.pool, async (client) =>
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
            return () => `evt_feedback_race_${++sequence}`;
          })(),
          runIdFactory: () => 'wr_feedback_race',
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'Select one option',
            questionId: 'q_feedback_race_1',
            options: [
              { id: 1, label: 'Approve' },
              { id: 2, label: 'Reject' },
            ],
            requestedByRunId: parentRun.runId,
            requestedByWorkflowType: parentRun.workflowType,
            requestedByState: parentRun.currentState,
          },
        },
      }),
    );

    const [responseA, responseB] = await Promise.all([
      integrationHarness.server.inject({
        method: 'POST',
        url: `/api/v1/human-feedback/requests/${launched.childRun.runId}/respond`,
        payload: {
          response: {
            questionId: 'q_feedback_race_1',
            selectedOptionIds: [1],
          },
          respondedBy: 'operator_A',
        },
      }),
      integrationHarness.server.inject({
        method: 'POST',
        url: `/api/v1/human-feedback/requests/${launched.childRun.runId}/respond`,
        payload: {
          response: {
            questionId: 'q_feedback_race_1',
            selectedOptionIds: [2],
          },
          respondedBy: 'operator_B',
        },
      }),
    ]);

    const responses = [responseA, responseB];
    const success = responses.find((response) => response.statusCode === 200);
    const conflict = responses.find((response) => response.statusCode === 409);

    expect(success).toBeDefined();
    expect(conflict).toBeDefined();

    const receivedEvents = await integrationHarness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'human-feedback.received'",
      [launched.childRun.runId],
    );
    expect(receivedEvents.rows[0]?.count).toBe(1);

    const completedEvents = await integrationHarness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.completed'",
      [launched.childRun.runId],
    );
    expect(completedEvents.rows[0]?.count).toBe(1);

    const projection = await integrationHarness.db.pool.query<{
      status: string;
      responded_by: string | null;
      responded_at: Date | null;
      cancelled_at: Date | null;
    }>(
      'SELECT status, responded_by, responded_at, cancelled_at FROM human_feedback_requests WHERE feedback_run_id = $1',
      [launched.childRun.runId],
    );

    expect(projection.rowCount).toBe(1);
    expect(projection.rows[0]?.status).toBe('responded');
    expect(['operator_A', 'operator_B']).toContain(projection.rows[0]?.responded_by ?? '');
    expect(projection.rows[0]?.responded_at).not.toBeNull();
    expect(projection.rows[0]?.cancelled_at).toBeNull();
  });
});
