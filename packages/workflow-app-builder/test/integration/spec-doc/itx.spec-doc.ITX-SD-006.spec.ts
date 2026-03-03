/**
 * ITX-SD-006: Completion confirmation validation permutations.
 *
 * Behaviors: B-SD-HFB-002, B-SD-HFB-003, B-SD-TRANS-007.
 *
 * Validates that exactly one option transitions to Done, and that zero,
 * multiple, or non-existent option selections remain pending.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createInitialStateData } from '../../../src/workflows/spec-doc/state-data.js';
import {
  COMPLETION_CONFIRMATION_QUESTION_ID,
  synthesizeCompletionConfirmation,
} from '../../../src/workflows/spec-doc/queue.js';
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
import { createMockContext, makeDefaultInput } from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

/** Build state data with only the completion-confirmation question in the queue. */
function makeCompletionStateData(): SpecDocStateData {
  const confirmation = synthesizeCompletionConfirmation();
  return {
    ...createInitialStateData(),
    queue: [{ ...confirmation, answered: false }],
    queueIndex: 0,
    counters: {
      integrationPasses: 1,
      consistencyCheckPasses: 1,
    },
    artifacts: {
      specPath: 'docs/final-spec.md',
    },
  };
}

describe('ITX-SD-006: Completion confirmation validation permutations', () => {
  it('exactly one valid option (id=1) transitions to Done (B-SD-TRANS-007)', async () => {
    feedbackController.reset({
      [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [1] }],
    });

    const input = makeDefaultInput();
    const stateData = makeCompletionStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('Done');
  });

  it('selecting "continue" option (id=2) routes to IntegrateIntoSpec', async () => {
    feedbackController.reset({
      [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [2] }],
    });

    const input = makeDefaultInput();
    const stateData = makeCompletionStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');
  });

  it('zero options keeps question pending via self-loop (B-SD-HFB-002)', async () => {
    feedbackController.reset({
      [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [] }],
    });

    const input = makeDefaultInput();
    const stateData = makeCompletionStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    // State data should be unchanged (same queueIndex, question not answered)
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queueIndex).toBe(0);
    expect(nextData.queue[0].answered).toBe(false);
  });

  it('multiple options keeps question pending (B-SD-HFB-003)', async () => {
    feedbackController.reset({
      [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [1, 2] }],
    });

    const input = makeDefaultInput();
    const stateData = makeCompletionStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue[0].answered).toBe(false);
  });

  it('non-existent option IDs keeps question pending (B-SD-HFB-002)', async () => {
    feedbackController.reset({
      [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [99] }],
    });

    const input = makeDefaultInput();
    const stateData = makeCompletionStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');
  });

  it('no transition to Done occurs for any invalid submission', async () => {
    const invalidCases = [
      { selectedOptionIds: [] as number[] },
      { selectedOptionIds: [1, 2] },
      { selectedOptionIds: [99] },
      { selectedOptionIds: [0] },
    ];

    for (const response of invalidCases) {
      feedbackController.reset({
        [COMPLETION_CONFIRMATION_QUESTION_ID]: [response],
      });
      obsSink.reset();

      const input = makeDefaultInput();
      const stateData = makeCompletionStateData();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleNumberedOptionsHumanRequest(ctx, stateData);

      const transitionTarget = result.transitions[0]?.to;
      expect(transitionTarget).not.toBe('Done');
    }
  });
});
