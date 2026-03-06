/**
 * ITX-SD-010: Question immutability enforcement.
 *
 * Behaviors: B-SD-QUEUE-002.
 *
 * Validates that original question prompt, options, and questionId are
 * unchanged after ExpandQuestionWithClarification creates a follow-up.
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

describe('ITX-SD-010: Question immutability enforcement', () => {
  function makeExpandStateData(sourceQuestion: ReturnType<typeof makeQueueItem>): SpecDocStateData {
    return {
      queue: [{ ...sourceQuestion, answered: true }, makeQueueItem('q-next')],
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: sourceQuestion.questionId,
          selectedOptionIds: [1],
          text: 'Needs clarification',
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
      pendingClarification: {
        sourceQuestionId: sourceQuestion.questionId,
        intent: 'clarifying-question',
        customQuestionText: 'What exactly do you mean?',
      },
    };
  }

  it('original question prompt is unchanged after follow-up generation (B-SD-QUEUE-002)', async () => {
    const sourceQuestion = makeQueueItem('q-immutable-prompt', {
      prompt: 'Original prompt text that must not change',
    });

    const stateData = makeExpandStateData(sourceQuestion);
    const originalPrompt = stateData.queue[0].prompt;

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-immutable-prompt-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    const nextData = result.transitions[0].data as SpecDocStateData;

    const originalInNewQueue = nextData.queue.find((q) => q.questionId === 'q-immutable-prompt');
    expect(originalInNewQueue).toBeDefined();
    expect(originalInNewQueue!.prompt).toBe(originalPrompt);
  });

  it('original question options are unchanged after follow-up generation (B-SD-QUEUE-002)', async () => {
    const sourceQuestion = makeQueueItem('q-immutable-opts');
    const stateData = makeExpandStateData(sourceQuestion);
    const originalOptions = JSON.stringify(stateData.queue[0].options);

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-immutable-opts-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const originalInNewQueue = nextData.queue.find((q) => q.questionId === 'q-immutable-opts');
    expect(JSON.stringify(originalInNewQueue!.options)).toBe(originalOptions);
  });

  it('original questionId is unchanged (B-SD-QUEUE-002)', async () => {
    const sourceQuestion = makeQueueItem('q-stable-id');
    const stateData = makeExpandStateData(sourceQuestion);

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-stable-id-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue[0].questionId).toBe('q-stable-id');
  });

  it('follow-up has a distinct questionId from the source (B-SD-QUEUE-002)', async () => {
    const sourceQuestion = makeQueueItem('q-distinct');
    const stateData = makeExpandStateData(sourceQuestion);

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-distinct-followup') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const followUp = nextData.queue.find((q) => q.questionId === 'q-distinct-followup');
    expect(followUp).toBeDefined();
    expect(followUp!.questionId).not.toBe('q-distinct');
  });

  it('queue inspector assertImmutability passes across before/after snapshots (B-SD-QUEUE-002)', async () => {
    const sourceQuestion = makeQueueItem('q-inspector-check');
    const stateData = makeExpandStateData(sourceQuestion);

    const beforeSnapshot = queueInspector.snapshot(stateData.queue, 'before');

    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-inspector-check-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    const afterSnapshot = queueInspector.snapshot(nextData.queue, 'after');

    // This should not throw
    queueInspector.assertImmutability(beforeSnapshot, afterSnapshot);
  });
});
