/**
 * GS-SD-004: Immediate-action child result completes full sweep before returning to integration.
 *
 * Behaviors: GS-SD-004, B-SD-TRANS-003, B-SD-CHILD-001, B-SD-CHILD-001B, B-SD-CHILD-004, B-SD-OBS-003.
 *
 * Golden scenario coverage note: covers GS-SD-004 (immediate-action) flow.
 * See also `gs.spec-doc.GS-SD-004A.spec.ts` for the mixed-aggregate questions-first variant (GS-SD-004A).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
  CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
} from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
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
  makeActionableItem,
  makeConsistencyOutput,
  makeDefaultInput,
  makeIntegrationOutput,
  makeQuestionItem,
  runFSM,
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

const makeResolutionResponse = (overrides?: ReturnType<typeof makeConsistencyOutput>) => ({
  structuredOutput: overrides ?? makeConsistencyOutput(),
});

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('GS-SD-004: Immediate-action child result completes full sweep before returning to integration', () => {
  it(
    'reintegrates only after the first pass executes every child stage and one PlanResolution step, then delays feedback until the next pass',
    { timeout: 15_000 },
    async () => {
      const actionableItems = [
        makeActionableItem('act-gs-004-001', {
          instruction: 'Rewrite the scope section so the supported user roles are explicit.',
          blockingIssueIds: ['bi-gs-004-001'],
        }),
        makeActionableItem('act-gs-004-002', {
          instruction: 'Add rollback-safety acceptance criteria before implementation begins.',
          blockingIssueIds: ['bi-gs-004-001'],
        }),
      ];
      const retainedFollowUpQuestion = makeQuestionItem('q-gs-004-retained-001');

      copilotDouble.reset({
        IntegrateIntoSpec: [
          {
            structuredOutput: makeIntegrationOutput({ specPath: 'docs/generated-spec-pass-1.md' }),
          },
          {
            structuredOutput: makeIntegrationOutput({ specPath: 'docs/generated-spec-pass-2.md' }),
          },
        ],
        ExecutePromptLayer: [
          {
            structuredOutput: narrowStageOutput(
              0,
              makeConsistencyOutput({
                followUpQuestions: [retainedFollowUpQuestion],
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
          ...CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.slice(2).map((_, index) => ({
            structuredOutput: narrowStageOutput(index + 2, makeConsistencyOutput()),
          })),
          ...CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((_, index) => ({
            structuredOutput: narrowStageOutput(index, makeConsistencyOutput()),
          })),
        ],
        PlanResolution: [
          makeResolutionResponse(
            makeConsistencyOutput({
              actionableItems,
              followUpQuestions: [retainedFollowUpQuestion],
            }),
          ),
          makeResolutionResponse(makeConsistencyOutput()),
        ],
      });

      feedbackController.reset({
        'q-gs-004-retained-001': [{ selectedOptionIds: [1] }],
        [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [1] }],
      });

      const fsmResult = await runFSM(
        makeDefaultInput({
          request: 'Create a specification for a deployment orchestration workflow.',
          constraints: ['Must support rollback safety checks', 'Must document operator personas'],
        }),
        copilotDouble,
        feedbackController,
        obsSink,
        {
          executeConsistencyChild: true,
          maxSteps: 20,
        },
      );

      expect(fsmResult.failedError).toBeUndefined();
      expect(fsmResult.completedOutput).toBeDefined();
      expect(fsmResult.completedOutput?.status).toBe('completed');
      expect(fsmResult.completedOutput?.specPath).toBe('docs/generated-spec-pass-2.md');
      expect(fsmResult.completedOutput?.artifacts.integrationPasses).toBe(2);
      expect(fsmResult.completedOutput?.artifacts.consistencyCheckPasses).toBe(2);

      // SDB-25: Mixed aggregate now routes questions-first:
      // IntegrateIntoSpec → Consistency → NumberedOptionsHumanRequest (resolve questions)
      // → IntegrateIntoSpec (combined source) → Consistency → NumberedOptions (completion) → Done
      expect(fsmResult.stateHistory.map(({ state }) => state)).toEqual([
        'start',
        'IntegrateIntoSpec',
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        'NumberedOptionsHumanRequest',
        'IntegrateIntoSpec',
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        'NumberedOptionsHumanRequest',
        'Done',
      ]);

      // The re-integration now uses consistency-action-items-with-feedback
      const reintegrationEntry = fsmResult.stateHistory[4];
      expect(reintegrationEntry.state).toBe('IntegrateIntoSpec');
      expect(
        reintegrationEntry.data as {
          source: string;
          actionableItems: typeof actionableItems;
        },
      ).toMatchObject({
        source: 'consistency-action-items-with-feedback',
        actionableItems,
      });

      const stageDelegations = obsSink
        .delegationEvents()
        .filter((event) => event.state === 'ExecutePromptLayer');
      expect(stageDelegations).toHaveLength(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length * 2);

      const planDelegations = obsSink
        .delegationEvents()
        .filter((event) => event.state === 'PlanResolution');
      expect(planDelegations).toHaveLength(2);

      const firstPassStageDelegations = stageDelegations.filter(
        (event) => event.sequence < planDelegations[0].sequence,
      );
      expect(firstPassStageDelegations.map((event) => event.payload.stageId)).toEqual(
        CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.stageId),
      );
      expect(planDelegations[0].payload.stageId).toBe(
        CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
      );
      expect(planDelegations[0].sequence).toBeGreaterThan(
        firstPassStageDelegations.at(-1)?.sequence ?? 0,
      );

      expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
        CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length * 2,
      );
      const planResolutionCalls = copilotDouble.callsByState('PlanResolution');
      expect(planResolutionCalls).toHaveLength(2);
      expect(planResolutionCalls[0].prompt).toContain('act-gs-004-001');
      expect(planResolutionCalls[0].prompt).toContain('act-gs-004-002');
      expect(planResolutionCalls[0].prompt).toContain('q-gs-004-retained-001');

      // SDB-25: questions-first routing means 2 feedback calls:
      // 1. the follow-up question from the mixed aggregate
      // 2. the completion-confirmation after all passes
      expect(feedbackController.calls).toHaveLength(2);
      expect(feedbackController.calls[0].questionId).toBe('q-gs-004-retained-001');
      expect(feedbackController.calls[0].calledAt).toBeDefined();
      expect(feedbackController.calls[1].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
      expect(feedbackController.calls[1].calledAt).toBeDefined();
    },
  );
});
