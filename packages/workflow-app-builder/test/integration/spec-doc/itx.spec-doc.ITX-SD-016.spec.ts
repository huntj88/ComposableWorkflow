/**
 * ITX-SD-016: Delegated child contract enforcement under full-sweep execution.
 *
 * Behaviors: B-SD-CHILD-001, B-SD-CHILD-002, B-SD-CHILD-003, B-SD-FAIL-001.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS } from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
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

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-016: Delegated child contract enforcement under full-sweep execution', () => {
  it('continues executing later prompt layers after an actionable stage and still routes actionable output to integration', async () => {
    const actionableItems = [
      makeActionableItem('act-short-001', {
        instruction: 'Resolve the objective mismatch before asking more questions.',
      }),
    ];

    const remainingResponses = Array.from(
      { length: CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length - 3 },
      (_, index) => ({
        structuredOutput: narrowStageOutput(
          index + 3,
          makeConsistencyOutput({
            blockingIssues: [],
            followUpQuestions: [],
          }),
        ),
      }),
    );

    copilotDouble.reset({
      ExecutePromptLayer: [
        {
          structuredOutput: narrowStageOutput(
            0,
            makeConsistencyOutput({
              actionableItems,
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            1,
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-late-001')],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            2,
            makeConsistencyOutput({
              blockingIssues: [],
              followUpQuestions: [makeQuestionItem('q-late-002')],
            }),
          ),
        },
        ...remainingResponses,
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

    const nextData = result.transitions[0].data as SpecDocStateData & {
      source: 'consistency-action-items';
      actionableItems: typeof actionableItems;
    };
    expect(nextData.source).toBe('consistency-action-items');
    expect(nextData.actionableItems).toEqual(actionableItems);
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );
  });

  it('fails the parent state when executed layers emit duplicate follow-up question IDs', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-dup-001')],
        }),
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-dup-001')],
        }),
      ]),
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.transitions).toHaveLength(0);
    expect(result.failedError).toBeDefined();
    expect(result.failedError?.message).toContain('duplicate follow-up questionId: q-dup-001');
    expect(result.failedError?.message).toContain(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[1].stageId);
  });

  it('fails the parent state when a child layer mixes actionable items and follow-up questions', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: [
        {
          structuredOutput: narrowStageOutput(
            0,
            makeConsistencyOutput({
              actionableItems: [makeActionableItem('act-mixed-001')],
              followUpQuestions: [makeQuestionItem('q-mixed-001')],
            }),
          ),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.transitions).toHaveLength(0);
    expect(result.failedError).toBeDefined();
    expect(result.failedError?.message).toContain('Output schema validation failed');
    expect(result.failedError?.message).toContain('followUpQuestions');
    expect(result.failedError?.message).toContain('actionableItems');
    expect(result.failedError?.message).toContain(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[0].stageId);
  });

  it('allows mixed aggregate preservation across stages while still executing later layers', async () => {
    const actionableItems = [makeActionableItem('act-mixed-aggregate-001')];

    const remainingResponses = Array.from(
      { length: CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length - 3 },
      (_, index) => ({
        structuredOutput: narrowStageOutput(
          index + 3,
          makeConsistencyOutput({
            blockingIssues: [],
            followUpQuestions: [],
          }),
        ),
      }),
    );

    copilotDouble.reset({
      ExecutePromptLayer: [
        {
          structuredOutput: narrowStageOutput(
            0,
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-mixed-aggregate-001')],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            1,
            makeConsistencyOutput({
              actionableItems,
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            2,
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-mixed-aggregate-002')],
            }),
          ),
        },
        ...remainingResponses,
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
  });

  it('fails the parent state when a later layer duplicates an earlier actionable item ID after full-sweep execution continues', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          actionableItems: [makeActionableItem('act-dup-001')],
        }),
        makeConsistencyOutput({
          actionableItems: [makeActionableItem('act-dup-001')],
        }),
      ]),
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.transitions).toHaveLength(0);
    expect(result.failedError).toBeDefined();
    expect(result.failedError?.message).toContain('duplicate actionable itemId: act-dup-001');
    expect(result.failedError?.message).toContain(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[1].stageId);
  });
});
