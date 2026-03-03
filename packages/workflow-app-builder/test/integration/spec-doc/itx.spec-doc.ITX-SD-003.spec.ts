/**
 * ITX-SD-003: Custom prompt classification routing matrix.
 *
 * Behaviors: B-SD-TRANS-005, B-SD-TRANS-008, B-SD-TRANS-009, B-SD-QUEUE-005.
 *
 * Validates the two classification intents route correctly with queue items
 * remaining and queue exhausted. Custom answer buffers are preserved in
 * accumulated answers and classification uses structuredOutput.intent as
 * sole routing authority.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleClassifyCustomPrompt } from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
import { createCopilotDouble, type CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import {
  createFeedbackController,
  type FeedbackController,
} from '../harness/spec-doc/feedback-controller.js';
import {
  createObservabilitySink,
  type ObservabilitySink,
} from '../harness/spec-doc/observability-sink.js';
import {
  createMockContext,
  makeDefaultInput,
  makeQueueItem,
  makeClassificationOutput,
  makeStateDataForClassification,
} from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-003: Custom prompt classification routing matrix', () => {
  const sourceQuestion = makeQueueItem('q-classify-001');

  it('routes clarifying-question to ExpandQuestionWithClarification (B-SD-TRANS-009)', async () => {
    copilotDouble.reset({
      ClassifyCustomPrompt: [
        {
          structuredOutput: makeClassificationOutput('clarifying-question', {
            clarifyingQuestionText: 'Could you clarify the scope boundary?',
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'What about edge cases?');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('ExpandQuestionWithClarification');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.pendingClarification).toBeDefined();
    expect(nextData.pendingClarification!.sourceQuestionId).toBe(sourceQuestion.questionId);
    expect(nextData.pendingClarification!.clarifyingQuestionText).toBe(
      'Could you clarify the scope boundary?',
    );
  });

  it('routes custom-answer to NumberedOptionsHumanRequest (B-SD-TRANS-008)', async () => {
    copilotDouble.reset({
      ClassifyCustomPrompt: [
        {
          structuredOutput: makeClassificationOutput('custom-answer', {
            customAnswerText: 'Use approach A with additional caching',
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'I prefer caching');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');
  });

  it('buffers custom-answer text in accumulated answers (B-SD-QUEUE-005)', async () => {
    copilotDouble.reset({
      ClassifyCustomPrompt: [
        {
          structuredOutput: makeClassificationOutput('custom-answer', {
            customAnswerText: 'Buffered custom answer content',
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'My preference is...');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    // Original answer + buffered answer = 2 entries
    expect(nextData.normalizedAnswers.length).toBeGreaterThan(stateData.normalizedAnswers.length);

    const bufferedAnswer = nextData.normalizedAnswers[nextData.normalizedAnswers.length - 1];
    expect(bufferedAnswer.questionId).toBe(sourceQuestion.questionId);
    expect(bufferedAnswer.text).toBe('Buffered custom answer content');
  });

  it('uses structuredOutput.intent as sole routing authority (B-SD-TRANS-005)', async () => {
    // Verify that text content doesn't affect routing — only intent matters
    copilotDouble.reset({
      ClassifyCustomPrompt: [
        {
          structuredOutput: {
            intent: 'custom-answer',
            // Text looks like a question but intent says custom-answer
            customAnswerText: 'What if we used approach C? That is my preference.',
          },
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'What if approach C?');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    // Sole authority is intent, not text content
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');
  });

  it('preserves queue state across custom-answer classification (B-SD-TRANS-008)', async () => {
    // Add more items to the queue beyond the answered source question
    const q2 = makeQueueItem('q-classify-002');
    const stateData = makeStateDataForClassification(sourceQuestion, 'My answer');
    stateData.queue.push(q2);

    copilotDouble.reset({
      ClassifyCustomPrompt: [{ structuredOutput: makeClassificationOutput('custom-answer') }],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    // Queue is preserved (source + remaining)
    expect(nextData.queue).toHaveLength(2);
    expect(nextData.queue[1].questionId).toBe('q-classify-002');
  });

  it('pendingClarification is not set for custom-answer intent', async () => {
    copilotDouble.reset({
      ClassifyCustomPrompt: [{ structuredOutput: makeClassificationOutput('custom-answer') }],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'My answer');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.pendingClarification).toBeUndefined();
  });
});
