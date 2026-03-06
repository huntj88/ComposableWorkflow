/**
 * ITX-SD-005: Clarification insertion ordering correctness.
 *
 * Behaviors: B-SD-QUEUE-002, B-SD-QUEUE-003, B-SD-TRANS-010, B-SD-SCHEMA-005.
 *
 * Validates that clarification follow-ups are inserted at the immediate-next
 * position, have distinct questionIds, kind "issue-resolution", and that
 * original questions are immutable after insertion.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
import { createCopilotDouble, type CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import {
  createFeedbackController,
  type FeedbackController,
} from '../harness/spec-doc/feedback-controller.js';
import {
  createObservabilitySink,
  type ObservabilitySink,
} from '../harness/spec-doc/observability-sink.js';
import { createQueueInspector, type QueueInspector } from '../harness/spec-doc/queue-inspector.js';
import {
  createMockContext,
  makeDefaultInput,
  makeQueueItem,
  makeClarificationFollowUpOutput,
} from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;
let queueInspector: QueueInspector;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
  queueInspector = createQueueInspector();
});

describe('ITX-SD-005: Clarification insertion ordering correctness', () => {
  it('inserts follow-up immediately after the source question (B-SD-QUEUE-002)', async () => {
    const q1 = makeQueueItem('q-001');
    const q2 = makeQueueItem('q-002');
    const q3 = makeQueueItem('q-003');

    // State: Q1 answered, queueIndex=1 (next item), pending clarification from Q1
    const stateData: SpecDocStateData = {
      queue: [{ ...q1, answered: true }, q2, q3],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-001',
          selectedOptionIds: [1],
          text: 'Clarification needed',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-001',
        intent: 'clarifying-question',
        customQuestionText: 'Can you clarify the boundary?',
      },
    };

    const beforeSnapshot = queueInspector.snapshot(stateData.queue, 'before-insertion');

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-001-followup-1') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;

    // Queue should now have 4 items: [Q1(answered), Q1-followup, Q2, Q3]
    expect(nextData.queue).toHaveLength(4);

    const afterSnapshot = queueInspector.snapshot(nextData.queue, 'after-insertion');
    queueInspector.assertInsertedAt(
      beforeSnapshot,
      afterSnapshot,
      { questionId: 'q-001-followup-1' },
      1,
    );
  });

  it('follow-up has a distinct questionId from the source (B-SD-QUEUE-003)', async () => {
    const sourceQ = makeQueueItem('q-source');
    const stateData: SpecDocStateData = {
      queue: [{ ...sourceQ, answered: true }],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-source',
          selectedOptionIds: [1],
          text: 'Need detail',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-source',
        intent: 'clarifying-question',
        customQuestionText: 'Clarify this',
      },
    };

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-source-clarification-1') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const followUp = nextData.queue[1];
    expect(followUp.questionId).toBe('q-source-clarification-1');
    expect(followUp.questionId).not.toBe('q-source');
  });

  it('follow-up question has kind "issue-resolution" (B-SD-SCHEMA-005)', async () => {
    const sourceQ = makeQueueItem('q-kind-test');
    const stateData: SpecDocStateData = {
      queue: [{ ...sourceQ, answered: true }],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-kind-test',
          selectedOptionIds: [1],
          text: 'Clarify kind',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-kind-test',
        intent: 'clarifying-question',
        customQuestionText: 'What kind?',
      },
    };

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-kind-test-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const followUp = nextData.queue[1];
    expect(followUp.kind).toBe('issue-resolution');
  });

  it('original question text and options are immutable after insertion (B-SD-QUEUE-002)', async () => {
    const q1 = makeQueueItem('q-immut');
    const q2 = makeQueueItem('q-immut-next');

    const stateData: SpecDocStateData = {
      queue: [{ ...q1, answered: true }, q2],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-immut',
          selectedOptionIds: [1],
          text: 'Clarify immutability',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-immut',
        intent: 'clarifying-question',
        customQuestionText: 'What about immutability?',
      },
    };

    const beforeSnapshot = queueInspector.snapshot(stateData.queue, 'before');

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-immut-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const afterSnapshot = queueInspector.snapshot(nextData.queue, 'after');

    // Verify original items are not mutated
    queueInspector.assertImmutability(beforeSnapshot, afterSnapshot);
  });

  it('follow-up question is unanswered when inserted (B-SD-TRANS-010)', async () => {
    const sourceQ = makeQueueItem('q-unanswered');
    const stateData: SpecDocStateData = {
      queue: [{ ...sourceQ, answered: true }],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-unanswered',
          selectedOptionIds: [1],
          text: 'Check unanswered',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-unanswered',
        intent: 'clarifying-question',
        customQuestionText: 'Is it answered?',
      },
    };

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-unanswered-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const followUp = nextData.queue.find((q) => q.questionId === 'q-unanswered-fu');
    expect(followUp).toBeDefined();
    expect(followUp!.answered).toBe(false);
  });

  it('pendingClarification is cleared after consumption (B-SD-TRANS-010)', async () => {
    const sourceQ = makeQueueItem('q-clear');
    const stateData: SpecDocStateData = {
      queue: [{ ...sourceQ, answered: true }],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-clear',
          selectedOptionIds: [1],
          text: 'Clarify',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: 'q-clear',
        intent: 'clarifying-question',
        customQuestionText: 'Clear this?',
      },
    };

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-clear-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.pendingClarification).toBeUndefined();
  });
});
