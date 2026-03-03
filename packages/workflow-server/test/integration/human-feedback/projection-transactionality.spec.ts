import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { launchChild } from '../../../src/orchestrator/child/launch-child.js';
import { withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createHumanFeedbackProjectionRepository } from '../../../src/persistence/human-feedback-projection-repository.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { createRunRepository, type RunSummary } from '../../../src/persistence/run-repository.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

describe('human feedback projection transactionality', () => {
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

  it('rolls back feedback requested event and projection write together, then allows committed write', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parentRun = await createParentRun('wr_parent_tx_alignment');
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();
    const projectionRepository = createHumanFeedbackProjectionRepository();
    const idempotencyRepository = createIdempotencyRepository();

    await expect(
      withTransaction(harness.db.pool, async (client) => {
        await launchChild({
          client,
          deps: {
            registry: harness.registry,
            runRepository,
            eventRepository,
            humanFeedbackProjectionRepository: projectionRepository,
            idempotencyRepository,
            now: () => new Date('2026-03-01T00:01:00.000Z'),
            eventIdFactory: (() => {
              let sequence = 0;
              return () => `evt_tx_rollback_${++sequence}`;
            })(),
            runIdFactory: () => 'wr_feedback_tx_rollback',
          },
          parentRun,
          request: {
            workflowType: 'server.human-feedback.v1',
            input: {
              prompt: 'Rollback request',
              questionId: 'q_tx_rollback',
              options: [
                { id: 1, label: 'One' },
                { id: 2, label: 'Two' },
              ],
              requestedByRunId: parentRun.runId,
              requestedByWorkflowType: parentRun.workflowType,
              requestedByState: parentRun.currentState,
            },
          },
        });

        throw new Error('rollback-sentinel');
      }),
    ).rejects.toThrow('rollback-sentinel');

    const rolledBackRequestedEvents = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE event_type = 'human-feedback.requested' AND run_id = 'wr_feedback_tx_rollback'",
    );
    expect(rolledBackRequestedEvents.rows[0]?.count).toBe(0);

    const rolledBackProjectionRows = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM human_feedback_requests WHERE feedback_run_id = 'wr_feedback_tx_rollback'",
    );
    expect(rolledBackProjectionRows.rows[0]?.count).toBe(0);

    const committed = await withTransaction(harness.db.pool, async (client) =>
      launchChild({
        client,
        deps: {
          registry: harness.registry,
          runRepository,
          eventRepository,
          humanFeedbackProjectionRepository: projectionRepository,
          idempotencyRepository,
          now: () => new Date('2026-03-01T00:01:10.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_tx_commit_${++sequence}`;
          })(),
          runIdFactory: () => 'wr_feedback_tx_commit',
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'Commit request',
            questionId: 'q_tx_commit',
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

    const committedRequestedEvents = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE event_type = 'human-feedback.requested' AND run_id = $1",
      [committed.childRun.runId],
    );
    expect(committedRequestedEvents.rows[0]?.count).toBe(1);

    const committedProjectionRows = await harness.db.pool.query<{ status: string }>(
      'SELECT status FROM human_feedback_requests WHERE feedback_run_id = $1',
      [committed.childRun.runId],
    );
    expect(committedProjectionRows.rowCount).toBe(1);
    expect(committedProjectionRows.rows[0]?.status).toBe('awaiting_response');
  });

  it('keeps first terminal feedback outcome and no-ops competing terminalization attempts', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const parentRun = await createParentRun('wr_parent_first_terminal');
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
          now: () => new Date('2026-03-01T00:02:00.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_first_terminal_${++sequence}`;
          })(),
          runIdFactory: () => 'wr_feedback_first_terminal',
        },
        parentRun,
        request: {
          workflowType: 'server.human-feedback.v1',
          input: {
            prompt: 'First terminal wins',
            questionId: 'q_first_terminal',
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

    await withTransaction(harness.db.pool, async (client) => {
      const first = await projectionRepository.recordResponded(client, {
        feedbackRunId: launched.childRun.runId,
        respondedAt: '2026-03-01T00:02:10.000Z',
        respondedBy: 'operator_a',
        response: {
          questionId: 'q_first_terminal',
          selectedOptionIds: [2],
          text: 'Confirmed',
        },
      });
      expect(first.applied).toBe(true);

      const competing = await projectionRepository.recordCancelled(client, {
        feedbackRunId: launched.childRun.runId,
        cancelledAt: '2026-03-01T00:02:11.000Z',
      });
      expect(competing.applied).toBe(false);
    });

    const afterCompeting = await harness.db.pool.query<{
      status: string;
      responded_by: string | null;
      cancelled_at: Date | null;
    }>(
      'SELECT status, responded_by, cancelled_at FROM human_feedback_requests WHERE feedback_run_id = $1',
      [launched.childRun.runId],
    );
    expect(afterCompeting.rows[0]?.status).toBe('responded');
    expect(afterCompeting.rows[0]?.responded_by).toBe('operator_a');
    expect(afterCompeting.rows[0]?.cancelled_at).toBeNull();

    await harness.db.pool.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
      launched.childRun.runId,
      'cancelling',
    ]);

    await withTransaction(harness.db.pool, async (client) => {
      const run = await runRepository.getRunSummary(client, launched.childRun.runId);
      if (!run) {
        throw new Error('Expected feedback child run to exist');
      }

      await runTransitionStep({
        client,
        deps: {
          registry: harness.registry,
          runRepository,
          eventRepository,
          humanFeedbackProjectionRepository: projectionRepository,
          idempotencyRepository,
          now: () => new Date('2026-03-01T00:02:20.000Z'),
          eventIdFactory: (() => {
            let sequence = 0;
            return () => `evt_terminal_cancel_${++sequence}`;
          })(),
        },
        run,
      });
    });

    const terminalProjection = await harness.db.pool.query<{
      status: string;
      responded_by: string | null;
    }>('SELECT status, responded_by FROM human_feedback_requests WHERE feedback_run_id = $1', [
      launched.childRun.runId,
    ]);
    expect(terminalProjection.rows[0]?.status).toBe('responded');
    expect(terminalProjection.rows[0]?.responded_by).toBe('operator_a');
  });
});
