import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('human feedback validation', () => {
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

  const launchFeedbackRun = async (params: {
    feedbackRunId: string;
    questionId: string;
    prompt: string;
    constraints?: string[];
  }) => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const parentRun = await createParentRun(`wr_parent_${params.feedbackRunId}`);
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
            return () => `evt_validation_${params.feedbackRunId}_${++sequence}`;
          })(),
          runIdFactory: () => params.feedbackRunId,
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: params.prompt,
            questionId: params.questionId,
            options: [
              { id: 1, label: 'Option 1' },
              { id: 2, label: 'Option 2' },
            ],
            constraints: params.constraints,
            requestedByRunId: parentRun.runId,
            requestedByWorkflowType: parentRun.workflowType,
            requestedByState: parentRun.currentState,
          },
        },
      }),
    );
  };

  it('returns 400 for invalid selected option IDs without terminalizing', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const launched = await launchFeedbackRun({
      feedbackRunId: 'wr_feedback_invalid_option',
      questionId: 'q_invalid_option_1',
      prompt: 'Select one option',
    });

    const invalidResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}/respond`,
      payload: {
        response: {
          questionId: 'q_invalid_option_1',
          selectedOptionIds: [9],
        },
        respondedBy: 'operator_invalid',
      },
    });

    expect(invalidResponse.statusCode).toBe(400);

    const missingQuestionResponse = await integrationHarness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${launched.childRun.runId}/respond`,
      payload: {
        response: {
          selectedOptionIds: [1],
        },
        respondedBy: 'operator_invalid',
      },
    });

    expect(missingQuestionResponse.statusCode).toBe(400);

    const projection = await integrationHarness.db.pool.query<{
      status: string;
      responded_at: Date | null;
    }>('SELECT status, responded_at FROM human_feedback_requests WHERE feedback_run_id = $1', [
      launched.childRun.runId,
    ]);
    expect(projection.rows[0]?.status).toBe('awaiting_response');
    expect(projection.rows[0]?.responded_at).toBeNull();

    const receivedEvents = await integrationHarness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'human-feedback.received'",
      [launched.childRun.runId],
    );
    expect(receivedEvents.rows[0]?.count).toBe(0);
  });

  it('enforces exactly one selected option for completion-confirmation prompts including synthesized variants', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const authored = await launchFeedbackRun({
      feedbackRunId: 'wr_feedback_completion_authored',
      questionId: 'q_completion_authored_1',
      prompt: 'Completion-confirmation: should we stop now?',
      constraints: ['kind:completion-confirmation'],
    });

    const synthesized = await launchFeedbackRun({
      feedbackRunId: 'wr_feedback_completion_synthesized',
      questionId: 'q_completion_synthesized_1',
      prompt: 'Workflow synthesized completion confirmation prompt (spec is done)',
    });

    for (const runId of [authored.childRun.runId, synthesized.childRun.runId]) {
      const zeroSelection = await integrationHarness.server.inject({
        method: 'POST',
        url: `/api/v1/human-feedback/requests/${runId}/respond`,
        payload: {
          response: {
            questionId:
              runId === authored.childRun.runId
                ? 'q_completion_authored_1'
                : 'q_completion_synthesized_1',
            selectedOptionIds: [],
          },
          respondedBy: 'operator_completion',
        },
      });
      expect(zeroSelection.statusCode).toBe(400);

      const multiSelection = await integrationHarness.server.inject({
        method: 'POST',
        url: `/api/v1/human-feedback/requests/${runId}/respond`,
        payload: {
          response: {
            questionId:
              runId === authored.childRun.runId
                ? 'q_completion_authored_1'
                : 'q_completion_synthesized_1',
            selectedOptionIds: [1, 2],
          },
          respondedBy: 'operator_completion',
        },
      });
      expect(multiSelection.statusCode).toBe(400);

      const projection = await integrationHarness.db.pool.query<{ status: string }>(
        'SELECT status FROM human_feedback_requests WHERE feedback_run_id = $1',
        [runId],
      );
      expect(projection.rows[0]?.status).toBe('awaiting_response');

      const accepted = await integrationHarness.server.inject({
        method: 'POST',
        url: `/api/v1/human-feedback/requests/${runId}/respond`,
        payload: {
          response: {
            questionId:
              runId === authored.childRun.runId
                ? 'q_completion_authored_1'
                : 'q_completion_synthesized_1',
            selectedOptionIds: [1],
          },
          respondedBy: 'operator_completion',
        },
      });
      expect(accepted.statusCode).toBe(200);
    }
  });
});
