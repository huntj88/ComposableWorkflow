/**
 * ITX-SD-013: Delegated child routing variants from aggregate consistency results.
 *
 * Behaviors: B-SD-TRANS-003, B-SD-TRANS-011, B-SD-CHILD-001.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS } from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../../../src/workflows/spec-doc/queue.js';
import { handleLogicalConsistencyCheck } from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
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
  makeActionableItem,
  makeConsistencyOutput,
  makeDefaultInput,
  makeQuestionItem,
  makeStateDataAfterIntegration,
} from './helpers.js';

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

const narrowStageOutput = (index: number, overrides?: ReturnType<typeof makeConsistencyOutput>) => {
  const output = overrides ?? makeConsistencyOutput();
  const layer = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[index];
  return {
    ...output,
    readinessChecklist: Object.fromEntries(
      layer.checklistKeys.map((key) => [key, output.readinessChecklist[key]]),
    ),
  };
};

const makeStageResponses = (
  overridesByIndex: Array<ReturnType<typeof makeConsistencyOutput> | undefined>,
) =>
  CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((_, index) => ({
    structuredOutput: narrowStageOutput(index, overridesByIndex[index]),
  }));

const makeResolutionResponse = (overrides?: ReturnType<typeof makeConsistencyOutput>) => ({
  structuredOutput: overrides ?? makeConsistencyOutput(),
});

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-013: Delegated child routing variants', () => {
  it('routes to IntegrateIntoSpec when the child aggregate contains actionable items (B-SD-TRANS-003)', async () => {
    const actionableItems = [
      makeActionableItem('act-route-001', {
        instruction: 'Add a missing scope boundary.',
        blockingIssueIds: ['bi-route-001'],
      }),
      makeActionableItem('act-route-002', {
        instruction: 'Clarify the acceptance criteria wording.',
        blockingIssueIds: ['bi-route-002'],
      }),
    ];

    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          actionableItems,
        }),
      ]),
      PlanResolution: [makeResolutionResponse(makeConsistencyOutput({ actionableItems }))],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');

    const nextData = result.transitions[0].data as SpecDocStateData & {
      source: 'consistency-action-items';
      actionableItems: typeof actionableItems;
    };
    expect(nextData.source).toBe('consistency-action-items');
    expect(nextData.actionableItems).toEqual(actionableItems);
    expect(nextData.queue).toEqual([]);
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );
  });

  it('prioritizes IntegrateIntoSpec for mixed aggregate child results and suppresses queue entry for that pass', async () => {
    const actionableItems = [
      makeActionableItem('act-mixed-route-001', {
        instruction: 'Apply the concrete contract fix before collecting more feedback.',
        blockingIssueIds: ['bi-mixed-route-001'],
      }),
    ];

    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-mixed-route-001')],
        }),
        makeConsistencyOutput({
          actionableItems,
        }),
      ]),
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            actionableItems,
            followUpQuestions: [makeQuestionItem('q-mixed-route-001')],
          }),
        ),
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );

    const nextData = result.transitions[0].data as SpecDocStateData & {
      source: 'consistency-action-items';
      actionableItems: typeof actionableItems;
    };
    expect(nextData.source).toBe('consistency-action-items');
    expect(nextData.actionableItems).toEqual(actionableItems);
    expect(nextData.queue).toEqual([]);
    expect(nextData.queueIndex).toBe(0);
  });

  it('routes to NumberedOptionsHumanRequest when the child aggregate contains follow-up questions', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-route-003')],
        }),
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-route-001')],
        }),
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-route-002')],
        }),
      ]),
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            followUpQuestions: [
              makeQuestionItem('q-route-003'),
              makeQuestionItem('q-route-001'),
              makeQuestionItem('q-route-002'),
            ],
          }),
        ),
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue.map((item) => item.questionId)).toEqual([
      'q-route-001',
      'q-route-002',
      'q-route-003',
    ]);
    expect(nextData.queueIndex).toBe(0);
    expect(nextData.counters.consistencyCheckPasses).toBe(1);
  });

  it('synthesizes a completion-confirmation question when the child aggregate is empty (B-SD-TRANS-011)', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([]),
      PlanResolution: [makeResolutionResponse(makeConsistencyOutput())],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration({
      counters: {
        integrationPasses: 2,
        consistencyCheckPasses: 1,
      },
      queueIndex: 5,
    });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(1);
    expect(nextData.queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
    expect(nextData.queueIndex).toBe(0);
    expect(nextData.counters.consistencyCheckPasses).toBe(2);
  });
});
