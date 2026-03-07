/**
 * ITX-SD-013: Consistency check follow-up and completion queue routing variants.
 *
 * Behaviors: B-SD-TRANS-003, B-SD-TRANS-011, B-SD-DONE-001.
 *
 * Validates the currently implemented follow-up/completion queue routing
 * variants for `LogicalConsistencyCheckCreateFollowUpQuestions`
 * (`followUpQuestions` present vs. empty).
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { handleLogicalConsistencyCheck } from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../../../src/workflows/spec-doc/queue.js';
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
  makeQuestionItem,
  makeConsistencyOutput,
  makeBlockingIssue,
  makeStateDataAfterIntegration,
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

describe('ITX-SD-013: Consistency check follow-up and completion queue routing variants', () => {
  it('routes to NumberedOptionsHumanRequest with blocking issues and follow-up questions (B-SD-TRANS-003)', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            blockingIssues: [makeBlockingIssue('issue-001'), makeBlockingIssue('issue-002')],
            followUpQuestions: [makeQuestionItem('q-route-001'), makeQuestionItem('q-route-002')],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    // Queue should contain both follow-up questions
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue.length).toBeGreaterThanOrEqual(2);
  });

  it('routes to NumberedOptionsHumanRequest with no blocking issues and empty follow-ups (B-SD-TRANS-011)', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            blockingIssues: [],
            followUpQuestions: [],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    // Empty follow-ups should trigger completion-confirmation synthesis
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(1);
    expect(nextData.queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
  });

  it('routes to NumberedOptionsHumanRequest with empty blockingIssues but present follow-ups', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            blockingIssues: [],
            followUpQuestions: [
              makeQuestionItem('q-route-no-block-001'),
              makeQuestionItem('q-route-no-block-002'),
              makeQuestionItem('q-route-no-block-003'),
            ],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    // Queue should contain the 3 follow-up questions (sorted)
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(3);
  });

  it('routes to NumberedOptionsHumanRequest with single blocking issue and single follow-up', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            blockingIssues: [makeBlockingIssue('issue-mixed-001')],
            followUpQuestions: [makeQuestionItem('q-route-single')],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(1);
    expect(nextData.queue[0].questionId).toBe('q-route-single');
  });

  it('increments consistencyCheckPasses on each successful pass (B-SD-DONE-001)', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            followUpQuestions: [makeQuestionItem('q-count-001')],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration({
      counters: {
        integrationPasses: 2,
        consistencyCheckPasses: 1,
      },
    });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.counters.consistencyCheckPasses).toBe(2);
  });

  it('resets queueIndex to 0 for new queue', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            followUpQuestions: [makeQuestionItem('q-idx-001')],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration({
      queueIndex: 5, // stale index from prior queue
    });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queueIndex).toBe(0);
  });
});
