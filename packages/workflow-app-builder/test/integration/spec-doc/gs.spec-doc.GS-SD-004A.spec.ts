/**
 * GS-SD-004A: Mixed-aggregate child result asks questions first then integrates both.
 *
 * Behaviors: GS-SD-004A, B-SD-TRANS-003, B-SD-CHILD-004, B-SD-INPUT-005, B-SD-OBS-003.
 *
 * Golden scenario coverage note: covers both GS-SD-004 (immediate-action) and GS-SD-004A
 * (mixed-aggregate questions-first) flows. See also `itx.spec-doc.GS-SD-004.spec.ts`.
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

describe('GS-SD-004A: Mixed-aggregate child result asks questions first then integrates both', () => {
  it(
    'routes mixed-aggregate through NumberedOptionsHumanRequest, collects answers, then integrates with both stashed items and collected answers',
    { timeout: 15_000 },
    async () => {
      // -- Fixtures --
      const actionableItems = [
        makeActionableItem('act-gs-004a-001', {
          instruction: 'Narrow scope to supported user personas for deployment orchestration.',
          blockingIssueIds: ['bi-gs-004a-001'],
        }),
        makeActionableItem('act-gs-004a-002', {
          instruction: 'Add rollback-safety acceptance criteria before implementation.',
          blockingIssueIds: ['bi-gs-004a-001'],
        }),
      ];
      const followUpQuestion1 = makeQuestionItem('q-gs-004a-001');
      const followUpQuestion2 = makeQuestionItem('q-gs-004a-002');

      // -- Copilot double configuration --
      // Pass 1: IntegrateIntoSpec produces initial draft
      // Pass 1: Consistency child returns mixed aggregate (both arrays)
      // Pass 2: IntegrateIntoSpec reintegrates with combined input
      // Pass 2: Consistency child returns clean (empty)
      copilotDouble.reset({
        IntegrateIntoSpec: [
          {
            structuredOutput: makeIntegrationOutput({
              specPath: 'docs/generated-spec-pass-1.md',
            }),
          },
          {
            structuredOutput: makeIntegrationOutput({
              specPath: 'docs/generated-spec-pass-2.md',
            }),
          },
        ],
        ExecutePromptLayer: [
          // Pass 1: stages — first returns follow-up questions, second returns actionable items
          {
            structuredOutput: narrowStageOutput(
              0,
              makeConsistencyOutput({
                followUpQuestions: [followUpQuestion1],
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
                followUpQuestions: [followUpQuestion2],
              }),
            ),
          },
          ...CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.slice(3).map((_, index) => ({
            structuredOutput: narrowStageOutput(index + 3, makeConsistencyOutput()),
          })),
          // Pass 2: all clean stages
          ...CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((_, index) => ({
            structuredOutput: narrowStageOutput(index, makeConsistencyOutput()),
          })),
        ],
        PlanResolution: [
          // Pass 1: mixed aggregate — both actionable items and follow-up questions
          makeResolutionResponse(
            makeConsistencyOutput({
              actionableItems,
              followUpQuestions: [followUpQuestion1, followUpQuestion2],
            }),
          ),
          // Pass 2: clean result
          makeResolutionResponse(makeConsistencyOutput()),
        ],
      });

      // -- Feedback controller: answers for all follow-up questions + completion --
      feedbackController.reset({
        'q-gs-004a-001': [{ selectedOptionIds: [1] }],
        'q-gs-004a-002': [{ selectedOptionIds: [2] }],
        [COMPLETION_CONFIRMATION_QUESTION_ID]: [{ selectedOptionIds: [1] }],
      });

      // -- Run full FSM --
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
          maxSteps: 25,
        },
      );

      // -- Assertions --

      // 1. No error, workflow completed successfully
      expect(fsmResult.failedError).toBeUndefined();
      expect(fsmResult.completedOutput).toBeDefined();
      expect(fsmResult.completedOutput?.status).toBe('completed');
      expect(fsmResult.completedOutput?.specPath).toBe('docs/generated-spec-pass-2.md');
      expect(fsmResult.completedOutput?.artifacts.integrationPasses).toBe(2);
      expect(fsmResult.completedOutput?.artifacts.consistencyCheckPasses).toBe(2);

      // 2. SD-QFC-004: Event stream shows IntegrateIntoSpec → Consistency → NumberedOptionsHumanRequest (self-loop) → IntegrateIntoSpec
      expect(fsmResult.stateHistory.map(({ state }) => state)).toEqual([
        'start',
        'IntegrateIntoSpec',
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        'NumberedOptionsHumanRequest',
        'NumberedOptionsHumanRequest',
        'IntegrateIntoSpec',
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        'NumberedOptionsHumanRequest',
        'Done',
      ]);

      // 3. SD-QFC-008: source === "consistency-action-items-with-feedback" on the reintegration entry
      const reintegrationEntry = fsmResult.stateHistory[5];
      expect(reintegrationEntry.state).toBe('IntegrateIntoSpec');
      const reintegrationData = reintegrationEntry.data as {
        source: string;
        actionableItems: typeof actionableItems;
        normalizedAnswers: Array<{ questionId: string }>;
      };
      expect(reintegrationData.source).toBe('consistency-action-items-with-feedback');

      // 4. SD-QFC-006: Stashed actionableItems forwarded unchanged and in order
      expect(reintegrationData.actionableItems).toEqual(actionableItems);
      expect(reintegrationData.actionableItems[0].itemId).toBe('act-gs-004a-001');
      expect(reintegrationData.actionableItems[1].itemId).toBe('act-gs-004a-002');

      // 5. SD-QFC-007: Collected answers from NumberedOptionsHumanRequest included in integration input
      expect(reintegrationData.normalizedAnswers.length).toBeGreaterThanOrEqual(2);
      expect(
        reintegrationData.normalizedAnswers.some((a) => a.questionId === 'q-gs-004a-001'),
      ).toBe(true);
      expect(
        reintegrationData.normalizedAnswers.some((a) => a.questionId === 'q-gs-004a-002'),
      ).toBe(true);

      // 6. SD-QFC-005: Feedback child runs launched for each follow-up question
      const feedbackCallQuestionIds = feedbackController.calls.map((c) => c.questionId);
      expect(feedbackCallQuestionIds).toContain('q-gs-004a-001');
      expect(feedbackCallQuestionIds).toContain('q-gs-004a-002');
      // Plus completion confirmation
      expect(feedbackCallQuestionIds).toContain(COMPLETION_CONFIRMATION_QUESTION_ID);
      expect(feedbackController.calls).toHaveLength(3);

      // 7. Observability: PlanResolution emitted exactly once per consistency pass
      const planDelegations = obsSink
        .delegationEvents()
        .filter((event) => event.state === 'PlanResolution');
      expect(planDelegations).toHaveLength(2);

      // 8. Observability: All configured prompt layers executed per pass
      const stageDelegations = obsSink
        .delegationEvents()
        .filter((event) => event.state === 'ExecutePromptLayer');
      expect(stageDelegations).toHaveLength(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length * 2);

      // 9. Full-sweep: first pass stages all completed before PlanResolution
      const firstPassStageDelegations = stageDelegations.filter(
        (event) => event.sequence < planDelegations[0].sequence,
      );
      expect(firstPassStageDelegations.map((event) => event.payload.stageId)).toEqual(
        CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.stageId),
      );
      expect(planDelegations[0].payload.stageId).toBe(
        CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
      );

      // 10. Copilot calls match expected counts
      expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
        CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length * 2,
      );
      const planResolutionCalls = copilotDouble.callsByState('PlanResolution');
      expect(planResolutionCalls).toHaveLength(2);

      // First PlanResolution call should reference the mixed-aggregate items
      expect(planResolutionCalls[0].prompt).toContain('act-gs-004a-001');
      expect(planResolutionCalls[0].prompt).toContain('act-gs-004a-002');
      expect(planResolutionCalls[0].prompt).toContain('q-gs-004a-001');
      expect(planResolutionCalls[0].prompt).toContain('q-gs-004a-002');

      // 11. Feedback ordering: follow-up questions answered before completion confirmation
      const q1CallIndex = feedbackController.calls.findIndex(
        (c) => c.questionId === 'q-gs-004a-001',
      );
      const q2CallIndex = feedbackController.calls.findIndex(
        (c) => c.questionId === 'q-gs-004a-002',
      );
      const completionCallIndex = feedbackController.calls.findIndex(
        (c) => c.questionId === COMPLETION_CONFIRMATION_QUESTION_ID,
      );
      expect(q1CallIndex).toBeLessThan(completionCallIndex);
      expect(q2CallIndex).toBeLessThan(completionCallIndex);
    },
  );
});
