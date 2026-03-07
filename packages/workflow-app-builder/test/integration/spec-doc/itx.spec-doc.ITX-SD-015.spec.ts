/**
 * ITX-SD-015: Deferred revisit feedback attempts and idempotency keys.
 *
 * Behaviors: B-SD-HFB-001, B-SD-HFB-005, B-SD-TRANS-013, B-SD-TRANS-015.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createInitialStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleClassifyCustomPrompt } from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
import { handleNumberedOptionsHumanRequest } from '../../../src/workflows/spec-doc/states/numbered-options-human-request.js';
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
  makeClassificationOutput,
  makeDefaultInput,
  makeQueueItem,
  makeResearchOnlyClarificationOutput,
} from './helpers.js';

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-015: Deferred revisit feedback attempts and idempotency keys', () => {
  it('increments the per-question attempt number before re-asking a deferred source question', async () => {
    const sourceQuestion = makeQueueItem('q-deferred-001');
    const trailingQuestion = makeQueueItem('q-trailing-001');

    feedbackController.reset({
      [sourceQuestion.questionId]: [
        {
          selectedOptionIds: [1],
          text: 'Please research how other teams handle this trade-off first.',
        },
        {
          selectedOptionIds: [2],
        },
      ],
    });

    copilotDouble.reset({
      ClassifyCustomPrompt: [
        {
          structuredOutput: makeClassificationOutput('clarifying-question', {
            customQuestionText: 'How do similar systems resolve this trade-off?',
          }),
        },
      ],
      ExpandQuestionWithClarification: [
        {
          structuredOutput: makeResearchOnlyClarificationOutput(
            'Existing project guidance resolves the research detour without creating another human question.',
          ),
        },
      ],
    });

    const input = makeDefaultInput();
    const initialState: SpecDocStateData = {
      ...createInitialStateData(),
      queue: [sourceQuestion, trailingQuestion],
      counters: {
        integrationPasses: 1,
        consistencyCheckPasses: 3,
      },
      artifacts: {
        specPath: 'docs/generated-spec.md',
      },
    };

    const firstAsk = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleNumberedOptionsHumanRequest(firstAsk.ctx, initialState);

    expect(firstAsk.result.failedError).toBeUndefined();
    expect(firstAsk.result.transitions).toHaveLength(1);
    expect(firstAsk.result.transitions[0].to).toBe('ClassifyCustomPrompt');

    const firstCall = feedbackController.callsByQuestionId(sourceQuestion.questionId)[0];
    expect(firstCall.idempotencyKey).toBe(
      'spec-doc:feedback:test-run-001:q-deferred-001:pass-3:attempt-0',
    );

    const classify = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleClassifyCustomPrompt(
      classify.ctx,
      firstAsk.result.transitions[0].data as SpecDocStateData,
    );

    expect(classify.result.failedError).toBeUndefined();
    expect(classify.result.transitions).toHaveLength(1);
    expect(classify.result.transitions[0].to).toBe('ExpandQuestionWithClarification');

    const deferredState = classify.result.transitions[0].data as SpecDocStateData;
    expect(deferredState.feedbackRequestAttemptsByQuestionId?.[sourceQuestion.questionId]).toBe(1);
    expect(deferredState.deferredQuestionIds).toEqual([sourceQuestion.questionId]);
    expect(deferredState.normalizedAnswers).toEqual([]);

    const expand = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleExpandQuestionWithClarification(expand.ctx, deferredState);

    expect(expand.result.failedError).toBeUndefined();
    expect(expand.result.transitions).toHaveLength(1);
    expect(expand.result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const revisitEntryState = expand.result.transitions[0].data as SpecDocStateData;
    expect(revisitEntryState.queueIndex).toBe(0);

    const revisit = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleNumberedOptionsHumanRequest(revisit.ctx, revisitEntryState);

    expect(revisit.result.failedError).toBeUndefined();
    expect(revisit.result.transitions).toHaveLength(1);
    expect(revisit.result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const calls = feedbackController.callsByQuestionId(sourceQuestion.questionId);
    expect(calls).toHaveLength(2);
    expect(calls[1].idempotencyKey).toBe(
      'spec-doc:feedback:test-run-001:q-deferred-001:pass-3:attempt-1',
    );
    expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);

    const nextState = revisit.result.transitions[0].data as SpecDocStateData;
    expect(nextState.queueIndex).toBe(1);
    expect(nextState.deferredQuestionIds).toEqual([]);
    expect(nextState.normalizedAnswers).toEqual([
      {
        questionId: sourceQuestion.questionId,
        selectedOptionIds: [2],
        answeredAt: '2026-01-15T10:00:00.000Z',
      },
    ]);
  });
});
