/**
 * ITX-SD-012: Prompt template ID traceability and delegated-child observability.
 *
 * Behaviors: B-SD-OBS-002, B-SD-OBS-003, B-SD-COPILOT-003, B-SD-CHILD-001.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
} from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import { OBS_TYPES } from '../../../src/workflows/spec-doc/observability.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { handleClassifyCustomPrompt } from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
import { handleIntegrateIntoSpec } from '../../../src/workflows/spec-doc/states/integrate-into-spec.js';
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
  makeClassificationOutput,
  makeClarificationFollowUpOutput,
  makeConsistencyOutput,
  makeDefaultInput,
  makeIntegrationOutput,
  makeQuestionItem,
  makeQueueItem,
  makeResearchOnlyClarificationOutput,
  makeStateDataAfterIntegration,
  makeStateDataForClassification,
  makeStateDataForExpandClarification,
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

describe('ITX-SD-012: Prompt template ID traceability and delegated-child observability', () => {
  it('IntegrateIntoSpec delegation emits spec-doc.integrate.v1 template ID (B-SD-OBS-002)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const input = makeDefaultInput();
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].payload.promptTemplateId).toBe(TEMPLATE_IDS.integrate);
  });

  it('LogicalConsistencyCheck records child workflow start/completion metadata and ordered prompt-layer stage IDs (B-SD-OBS-003)', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: makeStageResponses([
        makeConsistencyOutput({ followUpQuestions: [makeQuestionItem('q-obs-stage-001')] }),
      ]),
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();

    const childLaunches = result.childLaunches.filter(
      (launch) => launch.workflowType === CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    );
    expect(childLaunches).toHaveLength(1);
    expect(childLaunches[0].status).toBe('completed');
    expect(childLaunches[0].startedAt).toBeDefined();
    expect(childLaunches[0].completedAt).toBeDefined();

    const parentDelegation = obsSink
      .delegationEvents()
      .find((event) => event.state === 'LogicalConsistencyCheckCreateFollowUpQuestions');
    expect(parentDelegation?.payload).toMatchObject({
      promptTemplateId: CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[0].templateId,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    });

    const stageDelegations = obsSink
      .delegationEvents()
      .filter((event) => event.state === 'ExecutePromptLayer');
    expect(stageDelegations).toHaveLength(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length);
    expect(stageDelegations.map((event) => event.payload.childWorkflowType)).toEqual(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map(() => CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE),
    );
    expect(stageDelegations.map((event) => event.payload.stageId)).toEqual(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.stageId),
    );
    expect(stageDelegations.map((event) => event.payload.outputSchemaId)).toEqual(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.outputSchema),
    );

    const stageConsistencyOutcome = obsSink
      .consistencyOutcomeEvents()
      .find((event) => event.state === 'Done');
    expect(stageConsistencyOutcome?.payload.childWorkflowType).toBe(
      CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    );
  });

  it('child full-sweep execution is externally visible by ordered stage coverage even after actionable items appear (B-SD-OBS-003)', async () => {
    copilotDouble.reset({
      ExecutePromptLayer: [
        { structuredOutput: narrowStageOutput(0) },
        {
          structuredOutput: narrowStageOutput(
            1,
            makeConsistencyOutput({
              actionableItems: [
                makeActionableItem('act-obs-001', {
                  instruction: 'Rewrite the objective section to resolve the ambiguity.',
                }),
              ],
            }),
          ),
        },
        ...CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.slice(2).map((_, index) => ({
          structuredOutput: narrowStageOutput(index + 2, makeConsistencyOutput()),
        })),
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink, {
      executeConsistencyChild: true,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');

    const executedStageIds = obsSink
      .delegationEvents()
      .filter((event) => event.state === 'ExecutePromptLayer')
      .map((event) => event.payload.stageId);
    expect(executedStageIds).toEqual(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.stageId),
    );
    expect(copilotDouble.callsByState('ExecutePromptLayer')).toHaveLength(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.length,
    );

    const actionableOutcome = obsSink
      .consistencyOutcomeEvents()
      .find((event) => event.state === 'Done');
    expect(actionableOutcome?.payload.stageId).toBe(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.at(-1)?.stageId,
    );
    expect(actionableOutcome?.payload.actionableItemsCount).toBe(1);
    expect(actionableOutcome?.payload.stageSequence).toEqual(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) => layer.stageId),
    );
  });

  it('ClassifyCustomPrompt delegation emits spec-doc.classify-custom-prompt.v1 template ID', async () => {
    const sourceQuestion = makeQueueItem('q-tpl-classify');
    copilotDouble.reset({
      ClassifyCustomPrompt: [{ structuredOutput: makeClassificationOutput('custom-answer') }],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(
      sourceQuestion,
      'I prefer a different approach',
    );
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].payload.promptTemplateId).toBe(TEMPLATE_IDS.classifyCustomPrompt);
  });

  it('ExpandQuestionWithClarification delegation emits spec-doc.expand-clarification.v1 template ID', async () => {
    const sourceQuestion = makeQueueItem('q-tpl-expand');
    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-tpl-expand-fu') },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForExpandClarification(
      sourceQuestion,
      'What exactly is the scope?',
    );
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].payload.promptTemplateId).toBe(TEMPLATE_IDS.expandClarification);
  });

  it('research-only clarification emits research observability alongside template traceability (B-SD-OBS-001)', async () => {
    const sourceQuestion = makeQueueItem('q-tpl-research');
    copilotDouble.reset({
      ExpandQuestionWithClarification: [
        {
          structuredOutput: makeResearchOnlyClarificationOutput(
            'Workspace research resolves the clarification without asking another human question.',
          ),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataForExpandClarification(
      sourceQuestion,
      'What do the existing docs already say about this trade-off?',
    );
    stateData.queue[0] = { ...stateData.queue[0], answered: false };
    stateData.queueIndex = 1;
    stateData.normalizedAnswers = [];
    stateData.deferredQuestionIds = [sourceQuestion.questionId];
    stateData.researchNotes = [];
    stateData.pendingClarification = {
      sourceQuestionId: sourceQuestion.questionId,
      intent: 'clarifying-question',
      customQuestionText: 'What do the existing docs already say about this trade-off?',
    };

    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].payload.promptTemplateId).toBe(TEMPLATE_IDS.expandClarification);

    const researchEvents = obsSink.eventsByType(OBS_TYPES.researchResultLogged);
    expect(researchEvents).toHaveLength(1);
    expect(researchEvents[0].payload).toMatchObject({
      sourceQuestionId: sourceQuestion.questionId,
      researchOutcome: 'resolved-with-research',
      promptTemplateId: TEMPLATE_IDS.expandClarification,
    });
  });

  it('all TEMPLATE_IDS are exercised across delegating states (B-SD-COPILOT-003)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
      ExecutePromptLayer: makeStageResponses([makeConsistencyOutput()]),
      ClassifyCustomPrompt: [{ structuredOutput: makeClassificationOutput('custom-answer') }],
      ExpandQuestionWithClarification: [
        { structuredOutput: makeClarificationFollowUpOutput('q-all-expand-fu') },
      ],
    });

    const input = makeDefaultInput();
    const { ctx: integrateCtx } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleIntegrateIntoSpec(integrateCtx);

    const { ctx: consistencyCtx } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
      { executeConsistencyChild: true },
    );
    await handleLogicalConsistencyCheck(consistencyCtx, makeStateDataAfterIntegration());

    const classifyState = makeStateDataForClassification(
      makeQueueItem('q-all-classify'),
      'My clarification',
    );
    const { ctx: classifyCtx } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleClassifyCustomPrompt(classifyCtx, classifyState);

    const expandState = makeStateDataForExpandClarification(
      makeQueueItem('q-all-expand'),
      'Please clarify',
    );
    const { ctx: expandCtx } = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleExpandQuestionWithClarification(expandCtx, expandState);

    obsSink.assertAllDelegationsHaveTemplateId();
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.integrate);
    obsSink.assertTemplateIdUsed(CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS[0].templateId);
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.classifyCustomPrompt);
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.expandClarification);
  });

  it('copilot double records correlationId with correct state:templateId format', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const input = makeDefaultInput();
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx);

    const calls = copilotDouble.callsByState('IntegrateIntoSpec');
    expect(calls).toHaveLength(1);
    expect(calls[0].correlationId).toBe(`IntegrateIntoSpec:${TEMPLATE_IDS.integrate}`);
    expect(calls[0].templateId).toBe(TEMPLATE_IDS.integrate);
  });
});
