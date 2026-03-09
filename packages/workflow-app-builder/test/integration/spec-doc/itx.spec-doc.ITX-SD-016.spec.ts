/**
 * ITX-SD-016: Delegated child contract enforcement under full-sweep execution.
 *
 * Behaviors: B-SD-CHILD-001, B-SD-CHILD-001B, B-SD-CHILD-002, B-SD-CHILD-003, B-SD-CHILD-004, B-SD-FAIL-001.
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

const makeResolutionResponse = (overrides?: ReturnType<typeof makeConsistencyOutput>) => ({
  structuredOutput: overrides ?? makeConsistencyOutput(),
});

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-016: Delegated child contract enforcement under full-sweep execution', () => {
  it('continues executing later prompt layers after an actionable stage and still routes the single PlanResolution output to integration', async () => {
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
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            actionableItems,
            followUpQuestions: [makeQuestionItem('q-late-001'), makeQuestionItem('q-late-002')],
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

    const nextData = result.transitions[0].data as SpecDocStateData & {
      source: 'consistency-action-items';
      actionableItems: typeof actionableItems;
    };
    expect(nextData.source).toBe('consistency-action-items');
    expect(nextData.actionableItems).toEqual(actionableItems);
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );

    const planResolutionCalls = copilotDouble.callsByState('PlanResolution');
    expect(planResolutionCalls).toHaveLength(1);
    expect(planResolutionCalls[0].prompt).toContain('act-short-001');
    expect(planResolutionCalls[0].prompt).toContain('q-late-001');
    expect(planResolutionCalls[0].prompt).toContain('q-late-002');
  }, 10_000);

  it('deduplicates cross-stage follow-up question IDs, logs warn, and routes parent normally', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-dup-001')],
        }),
        makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-dup-001')],
        }),
      ]),
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            followUpQuestions: [makeQuestionItem('q-dup-001')],
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

    // Child completed — no failure
    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);

    // All stages executed plus PlanResolution
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );
    expect(copilotDouble.callsByState('PlanResolution')).toHaveLength(1);

    // Warn-level duplicate-skipped event emitted
    const dupEvents = obsSink.duplicateSkippedEvents();
    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].payload.duplicateId).toBe('q-dup-001');
    expect(dupEvents[0].payload.idType).toBe('questionId');
    expect(dupEvents[0].payload.producingStageId).toBe(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[1].stageId,
    );
    expect(dupEvents[0].payload.originStageId).toBe(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[0].stageId);
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
    expect(copilotDouble.callsByState('PlanResolution')).toHaveLength(0);
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
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            actionableItems,
            followUpQuestions: [
              makeQuestionItem('q-mixed-aggregate-001'),
              makeQuestionItem('q-mixed-aggregate-002'),
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

    const planResolutionCalls = copilotDouble.callsByState('PlanResolution');
    expect(planResolutionCalls).toHaveLength(1);
    expect(planResolutionCalls[0].prompt).toContain('act-mixed-aggregate-001');
    expect(planResolutionCalls[0].prompt).toContain('q-mixed-aggregate-001');
    expect(planResolutionCalls[0].prompt).toContain('q-mixed-aggregate-002');
  });

  it('deduplicates cross-stage actionable item IDs, logs warn, and routes parent to integration', async () => {
    const actionableItems = [makeActionableItem('act-dup-001')];

    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({
          actionableItems: [makeActionableItem('act-dup-001')],
        }),
        makeConsistencyOutput({
          actionableItems: [makeActionableItem('act-dup-001')],
        }),
      ]),
      PlanResolution: [
        makeResolutionResponse(
          makeConsistencyOutput({
            actionableItems,
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

    // Child completed — no failure, routes to IntegrateIntoSpec
    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');

    // All stages executed plus PlanResolution
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );
    expect(copilotDouble.callsByState('PlanResolution')).toHaveLength(1);

    // Warn-level duplicate-skipped event emitted
    const dupEvents = obsSink.duplicateSkippedEvents();
    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].payload.duplicateId).toBe('act-dup-001');
    expect(dupEvents[0].payload.idType).toBe('itemId');
    expect(dupEvents[0].payload.producingStageId).toBe(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[1].stageId,
    );
    expect(dupEvents[0].payload.originStageId).toBe(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[0].stageId);
  });
});
