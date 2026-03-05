import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  errorEnvelopeSchema,
  submitHumanFeedbackResponseConflictSchema,
  type ErrorEnvelope,
  type SubmitHumanFeedbackResponseConflict,
} from '@composable-workflow/workflow-api-types';

import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

const parseErrorEnvelopeOrThrow = (payload: unknown): ErrorEnvelope => {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Contract violation: expected ErrorEnvelope, received ${JSON.stringify(payload)}`,
    );
  }

  return parsed.data;
};

const parseConflictOrThrow = (payload: unknown): SubmitHumanFeedbackResponseConflict => {
  const parsed = submitHumanFeedbackResponseConflictSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Contract violation: expected SubmitHumanFeedbackResponseConflict, received ${JSON.stringify(payload)}`,
    );
  }

  return parsed.data;
};

describe('integration.api.error-envelope-conformance', () => {
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

  const createAwaitingFeedbackRun = async (runIdSuffix: string): Promise<string> => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }
    const integrationHarness = harness;

    const parentRun = await createParentRun(`wr_parent_error_contract_${runIdSuffix}`);
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
            return () => `evt_error_contract_${runIdSuffix}_${++sequence}`;
          })(),
          runIdFactory: () => `wr_feedback_error_contract_${runIdSuffix}`,
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'Choose one option',
            questionId: `q_error_contract_${runIdSuffix}`,
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

    return launched.childRun.runId;
  };

  it('ITX-034 / B-API-007 enforces ErrorEnvelope contract for covered 400/404 failures', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const notFound = await harness.server.inject({
      method: 'GET',
      url: '/api/v1/human-feedback/requests/wr_missing_error_contract',
    });
    expect(notFound.statusCode).toBe(404);
    const notFoundEnvelope = parseErrorEnvelopeOrThrow(notFound.json());
    expect(notFoundEnvelope.code).toBe('FEEDBACK_REQUEST_NOT_FOUND');
    expect(notFoundEnvelope.message).toContain('not found');
    expect(notFoundEnvelope.requestId.length).toBeGreaterThan(0);

    const invalidCursor = await harness.server.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/wr_any/feedback-requests?cursor=@@not-base64@@',
    });
    expect(invalidCursor.statusCode).toBe(400);
    const invalidCursorEnvelope = parseErrorEnvelopeOrThrow(invalidCursor.json());
    expect(invalidCursorEnvelope.code).toBe('INVALID_CURSOR');
    expect(invalidCursorEnvelope.message).toContain('Cursor');
    expect(invalidCursorEnvelope.requestId.length).toBeGreaterThan(0);

    const feedbackRunId = await createAwaitingFeedbackRun('validation_400');
    const invalidSelection = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId: `q_error_contract_validation_400`,
          selectedOptionIds: [999],
        },
        respondedBy: 'tester',
      },
    });
    expect(invalidSelection.statusCode).toBe(400);
    const invalidSelectionEnvelope = parseErrorEnvelopeOrThrow(invalidSelection.json());
    expect(invalidSelectionEnvelope.code).toBe('VALIDATION_ERROR');
    expect(invalidSelectionEnvelope.requestId.length).toBeGreaterThan(0);
  });

  it('ITX-034 / B-API-007 enforces SubmitHumanFeedbackResponseConflict contract for feedback 409', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const feedbackRunId = await createAwaitingFeedbackRun('conflict_409');

    const accepted = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId: 'q_error_contract_conflict_409',
          selectedOptionIds: [1],
        },
        respondedBy: 'operator_1',
      },
    });
    expect(accepted.statusCode).toBe(200);

    const conflict = await harness.server.inject({
      method: 'POST',
      url: `/api/v1/human-feedback/requests/${feedbackRunId}/respond`,
      payload: {
        response: {
          questionId: 'q_error_contract_conflict_409',
          selectedOptionIds: [2],
        },
        respondedBy: 'operator_2',
      },
    });
    expect(conflict.statusCode).toBe(409);

    const conflictBody = parseConflictOrThrow(conflict.json());
    expect(conflictBody.feedbackRunId).toBe(feedbackRunId);
    expect(conflictBody.status).toBe('responded');
    expect(conflictBody.respondedAt).toMatch(/\d{4}-\d{2}-\d{2}T/u);
    expect(conflictBody.cancelledAt ?? null).toBeNull();
    expect(Boolean(conflictBody.respondedAt) || Boolean(conflictBody.cancelledAt)).toBe(true);
  });

  it('ITX-034 rejects malformed error-contract payloads as explicit contract violations', () => {
    expect(() => parseErrorEnvelopeOrThrow({ code: 'X', message: 'missing-request-id' })).toThrow(
      /Contract violation/u,
    );

    expect(() =>
      parseConflictOrThrow({
        feedbackRunId: 'wr_bad_conflict',
        respondedAt: '2026-03-05T00:00:00.000Z',
      }),
    ).toThrow(/Contract violation/u);
  });
});
