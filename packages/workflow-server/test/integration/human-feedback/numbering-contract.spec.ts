import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('human feedback numbering contract', () => {
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

  it('rejects invalid option numbering before child run, request event, or projection row creation', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parentRun = await createParentRun('wr_parent_invalid_numbering');
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();

    await expect(
      withTransaction(harness.db.pool, async (client) =>
        launchChild({
          client,
          deps: {
            registry: harness.registry,
            runRepository,
            eventRepository,
            humanFeedbackProjectionRepository: projectionRepository,
            idempotencyRepository,
            now: () => new Date('2026-03-01T00:00:00.000Z'),
            eventIdFactory: () => 'evt_invalid_numbering',
            runIdFactory: () => 'wr_feedback_invalid_numbering',
          },
          parentRun,
          request: {
            workflowType: 'server.human-feedback.v1',
            input: {
              prompt: 'Pick one',
              questionId: 'q_invalid_1',
              options: [
                { id: 1, label: 'One' },
                { id: 3, label: 'Three' },
              ],
              requestedByRunId: parentRun.runId,
              requestedByWorkflowType: parentRun.workflowType,
              requestedByState: parentRun.currentState,
            },
          },
        }),
      ),
    ).rejects.toThrow('contiguous integers starting at 1');

    const childRuns = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM workflow_runs WHERE parent_run_id = $1',
      [parentRun.runId],
    );
    expect(childRuns.rows[0]?.count).toBe(0);

    const feedbackEvents = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE event_type = 'human-feedback.requested'",
    );
    expect(feedbackEvents.rows[0]?.count).toBe(0);

    const projectionRows = await harness.db.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM human_feedback_requests WHERE parent_run_id = $1',
      [parentRun.runId],
    );
    expect(projectionRows.rows[0]?.count).toBe(0);
  });

  it('accepts valid contiguous numbering and persists pending request projection state', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parentRun = await createParentRun('wr_parent_valid_numbering');
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();

    const launched = await withTransaction(harness.db.pool, async (client) =>
      launchChild({
        client,
        deps: {
          registry: harness.registry,
          runRepository,
          eventRepository,
          humanFeedbackProjectionRepository: projectionRepository,
          idempotencyRepository,
          now: () => new Date('2026-03-01T00:00:10.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_valid_numbering_${++sequence}`;
          })(),
          runIdFactory: () => 'wr_feedback_valid_numbering',
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'Pick one',
            questionId: 'q_valid_1',
            options: [
              { id: 1, label: 'One' },
              { id: 2, label: 'Two' },
            ],
            requestedByRunId: parentRun.runId,
            requestedByWorkflowType: parentRun.workflowType,
            requestedByState: parentRun.currentState,
          },
        },
      }),
    );

    const projection = await harness.db.pool.query<{
      status: string;
      question_id: string;
    }>('SELECT status, question_id FROM human_feedback_requests WHERE feedback_run_id = $1', [
      launched.childRun.runId,
    ]);
    expect(projection.rowCount).toBe(1);
    expect(projection.rows[0]?.status).toBe('awaiting_response');
    expect(projection.rows[0]?.question_id).toBe('q_valid_1');
  });
});
