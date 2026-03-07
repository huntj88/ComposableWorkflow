import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import {
  OBS_TYPES,
  emitClassificationOutcome,
  emitClarificationGenerated,
  emitConsistencyOutcome,
  emitDelegationStarted,
  emitIntegrationPassCompleted,
  emitQuestionGenerated,
  emitResponseReceived,
  emitTerminalCompleted,
  type ConsistencyOutcomePayload,
  type DelegationStartedPayload,
} from '../../../src/workflows/spec-doc/observability.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';
import { CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE } from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';

function createMockContext() {
  const logSpy = vi.fn();
  const ctx = {
    runId: 'run-obs-001',
    workflowType: 'app-builder.spec-doc.v1',
    input: {},
    now: () => new Date('2026-03-03T12:00:00Z'),
    log: logSpy,
    transition: vi.fn(),
    launchChild: vi.fn(),
    runCommand: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  } as unknown as WorkflowContext<unknown, unknown>;
  return { ctx, logSpy };
}

describe('spec-doc observability', () => {
  it('emits delegation events with child workflow and stage metadata', () => {
    const { ctx, logSpy } = createMockContext();

    const payload = emitDelegationStarted(ctx, {
      state: 'ExecutePromptLayer',
      promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: 'baseline-consistency',
    });

    expect(payload).toMatchObject({
      observabilityType: OBS_TYPES.delegationStarted,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: 'baseline-consistency',
    });

    const logged = logSpy.mock.calls[0][0] as { payload: DelegationStartedPayload };
    expect(logged.payload.childWorkflowType).toBe(CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE);
    expect(logged.payload.stageId).toBe('baseline-consistency');
  });

  it('emits consistency outcome with actionable item counts and child metadata', () => {
    const { ctx, logSpy } = createMockContext();

    const payload = emitConsistencyOutcome(ctx, {
      state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
      blockingIssuesCount: 2,
      actionableItemsCount: 1,
      followUpQuestionsCount: 0,
      passNumber: 3,
      promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: 'baseline-consistency',
    });

    expect(payload).toMatchObject({
      observabilityType: OBS_TYPES.consistencyOutcome,
      blockingIssuesCount: 2,
      actionableItemsCount: 1,
      followUpQuestionsCount: 0,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: 'baseline-consistency',
    });

    const logged = logSpy.mock.calls[0][0] as { payload: ConsistencyOutcomePayload };
    expect(logged.payload.actionableItemsCount).toBe(1);
    expect(logged.payload.childWorkflowType).toBe(CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE);
  });

  it('preserves event ordering across parent and child observability', () => {
    const { ctx, logSpy } = createMockContext();

    emitDelegationStarted(ctx, {
      state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
      promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    });
    emitDelegationStarted(ctx, {
      state: 'ExecutePromptLayer',
      promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: 'baseline-consistency',
    });
    emitConsistencyOutcome(ctx, {
      state: 'EmitFollowUpQuestions',
      blockingIssuesCount: 0,
      actionableItemsCount: 0,
      followUpQuestionsCount: 2,
      passNumber: 1,
      promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    });

    expect(
      logSpy.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { payload: { observabilityType: string } }).payload.observabilityType,
      ),
    ).toEqual([
      OBS_TYPES.delegationStarted,
      OBS_TYPES.delegationStarted,
      OBS_TYPES.consistencyOutcome,
    ]);
  });

  it('still emits the existing non-child helpers', () => {
    const { ctx, logSpy } = createMockContext();

    emitIntegrationPassCompleted(ctx, {
      state: 'IntegrateIntoSpec',
      source: 'workflow-input',
      specPath: 'specs/test.md',
      passNumber: 1,
      changeSummaryCount: 2,
      resolvedCount: 0,
      remainingCount: 1,
      promptTemplateId: TEMPLATE_IDS.integrate,
    });
    emitQuestionGenerated(ctx, {
      state: 'NumberedOptionsHumanRequest',
      questionId: 'q-1',
      kind: 'issue-resolution',
      queuePosition: 0,
      queueSize: 1,
    });
    emitResponseReceived(ctx, {
      state: 'NumberedOptionsHumanRequest',
      questionId: 'q-1',
      selectedOptionIds: [1],
      hasCustomText: false,
    });
    emitClassificationOutcome(ctx, {
      state: 'ClassifyCustomPrompt',
      questionId: 'q-1',
      intent: 'custom-answer',
      promptTemplateId: TEMPLATE_IDS.classifyCustomPrompt,
    });
    emitClarificationGenerated(ctx, {
      state: 'ExpandQuestionWithClarification',
      sourceQuestionId: 'q-1',
      followUpQuestionId: 'q-1-c1',
      insertIndex: 1,
      promptTemplateId: TEMPLATE_IDS.expandClarification,
    });
    emitTerminalCompleted(ctx, {
      state: 'Done',
      specPath: 'specs/test.md',
      integrationPasses: 2,
      consistencyCheckPasses: 2,
    });

    expect(logSpy).toHaveBeenCalledTimes(6);
  });
});
