/**
 * ITX-SD-004: Research-only clarification resolution.
 *
 * Behaviors: B-SD-TRANS-010, B-SD-TRANS-014, B-SD-OBS-001.
 *
 * Validates that research-only clarification outcomes emit observability,
 * avoid inserting a new follow-up question, and resume the deferred source
 * question before the workflow advances to older queued items.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { OBS_TYPES } from '../../../src/workflows/spec-doc/observability.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
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

function makeResearchOnlyStateData(): SpecDocStateData {
  const q1 = makeQueueItem('q-research-001');
  const q2 = makeQueueItem('q-research-002');

  return {
    queue: [q1, q2],
    queueIndex: 1,
    normalizedAnswers: [],
    counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
    artifacts: { specPath: 'docs/generated-spec.md' },
    deferredQuestionIds: ['q-research-001'],
    researchNotes: [],
    pendingClarification: {
      sourceQuestionId: 'q-research-001',
      intent: 'unrelated-question',
      customQuestionText: 'What do mature products usually do for this API decision?',
    },
  };
}

describe('ITX-SD-004: Research-only clarification resolution', () => {
  it('logs research results, avoids insertion, and resumes the deferred source question (B-SD-TRANS-014)', async () => {
    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        {
          structuredOutput: makeResearchOnlyClarificationOutput(
            'Repository research shows REST is sufficient for the current read/write profile.',
          ),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeResearchOnlyStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(2);
    expect(nextData.queue.map((item) => item.questionId)).toEqual([
      'q-research-001',
      'q-research-002',
    ]);
    expect(nextData.queueIndex).toBe(0);
    expect(nextData.pendingClarification).toBeUndefined();
    expect(nextData.deferredQuestionIds).toEqual(['q-research-001']);
    expect(nextData.researchNotes).toHaveLength(1);
    expect(nextData.researchNotes[0]).toMatchObject({
      sourceQuestionId: 'q-research-001',
      intent: 'unrelated-question',
      questionText: 'What do mature products usually do for this API decision?',
      researchSummary:
        'Repository research shows REST is sufficient for the current read/write profile.',
    });

    expect(obsSink.clarificationGeneratedEvents()).toHaveLength(0);

    const researchEvents = obsSink.eventsByType(OBS_TYPES.researchResultLogged);
    expect(researchEvents).toHaveLength(1);
    expect(researchEvents[0].payload).toMatchObject({
      sourceQuestionId: 'q-research-001',
      intent: 'unrelated-question',
      researchOutcome: 'resolved-with-research',
      researchSummary:
        'Repository research shows REST is sufficient for the current read/write profile.',
    });

    expect(obsSink.delegationEvents()).toHaveLength(1);
  });

  it('revisits the deferred source question before advancing to older queued items (B-SD-TRANS-014)', async () => {
    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        {
          structuredOutput: makeResearchOnlyClarificationOutput(
            'Existing ADRs already answer the detour without generating a new question.',
          ),
        },
      ],
    });
    feedbackController.reset({
      'q-research-001': [{ selectedOptionIds: [1] }],
      'q-research-002': [{ selectedOptionIds: [2] }],
    });

    const input = makeDefaultInput();
    const stateData = makeResearchOnlyStateData();
    const { ctx: expandCtx, result: expandResult } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleExpandQuestionWithClarification(expandCtx, stateData);

    const resumedData = expandResult.transitions[0].data as SpecDocStateData;

    const { ctx: firstQuestionCtx, result: firstQuestionResult } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(firstQuestionCtx, resumedData);

    expect(firstQuestionResult.failedError).toBeUndefined();
    expect(firstQuestionResult.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const afterDeferredReplay = firstQuestionResult.transitions[0].data as SpecDocStateData;
    expect(afterDeferredReplay.queueIndex).toBe(1);
    expect(afterDeferredReplay.deferredQuestionIds).toEqual([]);

    const { ctx: secondQuestionCtx, result: secondQuestionResult } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(secondQuestionCtx, afterDeferredReplay);

    expect(secondQuestionResult.failedError).toBeUndefined();
    expect(secondQuestionResult.transitions[0].to).toBe('IntegrateIntoSpec');
    expect(feedbackController.calls.map((call) => call.questionId)).toEqual([
      'q-research-001',
      'q-research-002',
    ]);
  });
});
