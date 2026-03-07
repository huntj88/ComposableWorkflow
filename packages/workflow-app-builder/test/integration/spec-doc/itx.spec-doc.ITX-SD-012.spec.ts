/**
 * ITX-SD-012: Prompt template ID traceability in delegation events.
 *
 * Behaviors: B-SD-OBS-002, B-SD-COPILOT-003.
 *
 * Validates that every copilot delegation emits an observability event
 * carrying the prompt template ID and that the IDs match the canonical
 * `TEMPLATE_IDS` constants.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { handleIntegrateIntoSpec } from '../../../src/workflows/spec-doc/states/integrate-into-spec.js';
import { handleLogicalConsistencyCheck } from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import { handleClassifyCustomPrompt } from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { OBS_TYPES } from '../../../src/workflows/spec-doc/observability.js';
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
  makeIntegrationOutput,
  makeConsistencyOutput,
  makeQuestionItem,
  makeClassificationOutput,
  makeClarificationFollowUpOutput,
  makeResearchOnlyClarificationOutput,
  makeStateDataAfterIntegration,
  makeStateDataForClassification,
  makeStateDataForExpandClarification,
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

describe('ITX-SD-012: Prompt template ID traceability', () => {
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

  it('LogicalConsistencyCheck delegation emits spec-doc.consistency-check.v1 template ID', async () => {
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        {
          structuredOutput: makeConsistencyOutput({
            followUpQuestions: [makeQuestionItem('q-tpl-001')],
          }),
        },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].payload.promptTemplateId).toBe(TEMPLATE_IDS.consistencyCheck);
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

  it('all TEMPLATE_IDS are exercised across delegating states (B-SD-COPILOT-003)', async () => {
    // Run all 4 delegating states sequentially and check all template IDs appear

    // 1. IntegrateIntoSpec
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });
    const input = makeDefaultInput();
    const { ctx: ctx1 } = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleIntegrateIntoSpec(ctx1);

    // 2. LogicalConsistencyCheck
    copilotDouble.addResponses('LogicalConsistencyCheckCreateFollowUpQuestions', [
      {
        structuredOutput: makeConsistencyOutput({
          followUpQuestions: [makeQuestionItem('q-all-001')],
        }),
      },
    ]);
    const stateData2 = makeStateDataAfterIntegration();
    const { ctx: ctx2 } = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleLogicalConsistencyCheck(ctx2, stateData2);

    // 3. ClassifyCustomPrompt
    copilotDouble.addResponses('ClassifyCustomPrompt', [
      { structuredOutput: makeClassificationOutput('custom-answer') },
    ]);
    const sourceQ = makeQueueItem('q-all-classify');
    const stateData3 = makeStateDataForClassification(sourceQ, 'My clarification');
    const { ctx: ctx3 } = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleClassifyCustomPrompt(ctx3, stateData3);

    // 4. ExpandQuestionWithClarification
    copilotDouble.addResponses('ExpandQuestionWithClarification', [
      { structuredOutput: makeClarificationFollowUpOutput('q-all-expand-fu') },
    ]);
    const sourceQ2 = makeQueueItem('q-all-expand');
    const stateData4 = makeStateDataForExpandClarification(sourceQ2, 'Please clarify');
    const { ctx: ctx4 } = createMockContext(input, copilotDouble, feedbackController, obsSink);
    await handleExpandQuestionWithClarification(ctx4, stateData4);

    // Assert all template IDs were used
    obsSink.assertAllDelegationsHaveTemplateId();
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.integrate);
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.consistencyCheck);
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.classifyCustomPrompt);
    obsSink.assertTemplateIdUsed(TEMPLATE_IDS.expandClarification);
  });

  it('delegation events include correct observabilityType (B-SD-OBS-002)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const input = makeDefaultInput();
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx);

    const delegations = obsSink.delegationEvents();
    expect(delegations).toHaveLength(1);
    expect(delegations[0].observabilityType).toBe(OBS_TYPES.delegationStarted);
    expect(delegations[0].state).toBe('IntegrateIntoSpec');
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
