import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import {
  OBS_TYPES,
  emitDelegationStarted,
  emitIntegrationPassCompleted,
  emitConsistencyOutcome,
  emitQuestionGenerated,
  emitResponseReceived,
  emitClassificationOutcome,
  emitClarificationGenerated,
  emitTerminalCompleted,
  type DelegationStartedPayload,
  type IntegrationPassCompletedPayload,
  type ConsistencyOutcomePayload,
  type QuestionGeneratedPayload,
  type ResponseReceivedPayload,
  type ClassificationOutcomePayload,
  type ClarificationGeneratedPayload,
  type TerminalCompletedPayload,
} from '../../../src/workflows/spec-doc/observability.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// OBS_TYPES constant tests
// ---------------------------------------------------------------------------

describe('spec-doc observability', () => {
  describe('OBS_TYPES', () => {
    it('all types are unique strings', () => {
      const values = Object.values(OBS_TYPES);
      expect(new Set(values).size).toBe(values.length);
    });

    it('all types follow spec-doc naming convention', () => {
      for (const type of Object.values(OBS_TYPES)) {
        expect(type).toMatch(/^spec-doc\./);
      }
    });

    it('contains all required observable event types', () => {
      expect(OBS_TYPES.delegationStarted).toBeDefined();
      expect(OBS_TYPES.integrationPassCompleted).toBeDefined();
      expect(OBS_TYPES.consistencyOutcome).toBeDefined();
      expect(OBS_TYPES.questionGenerated).toBeDefined();
      expect(OBS_TYPES.responseReceived).toBeDefined();
      expect(OBS_TYPES.classificationOutcome).toBeDefined();
      expect(OBS_TYPES.clarificationGenerated).toBeDefined();
      expect(OBS_TYPES.terminalCompleted).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // emitDelegationStarted
  // -------------------------------------------------------------------------

  describe('emitDelegationStarted', () => {
    it('emits log with promptTemplateId and outputSchemaId', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitDelegationStarted(ctx, {
        state: 'IntegrateIntoSpec',
        promptTemplateId: TEMPLATE_IDS.integrate,
        outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
        inputSchemaId: SCHEMA_IDS.specIntegrationInput,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith({
        level: 'info',
        message: expect.stringContaining(TEMPLATE_IDS.integrate),
        payload: expect.objectContaining({
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: TEMPLATE_IDS.integrate,
          outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
          inputSchemaId: SCHEMA_IDS.specIntegrationInput,
        }),
      });

      expect(payload.observabilityType).toBe(OBS_TYPES.delegationStarted);
      expect(payload.promptTemplateId).toBe(TEMPLATE_IDS.integrate);
    });

    it('omits inputSchemaId when not provided', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitDelegationStarted(ctx, {
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
        outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      });

      const call = logSpy.mock.calls[0][0] as { payload: DelegationStartedPayload };
      expect(call.payload.inputSchemaId).toBeUndefined();
      expect(payload.inputSchemaId).toBeUndefined();
    });

    it('returns explicitly typed DelegationStartedPayload', () => {
      const { ctx } = createMockContext();
      const payload: DelegationStartedPayload = emitDelegationStarted(ctx, {
        state: 'IntegrateIntoSpec',
        promptTemplateId: TEMPLATE_IDS.integrate,
        outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
      });
      expect(payload.observabilityType).toBe(OBS_TYPES.delegationStarted);
    });
  });

  // -------------------------------------------------------------------------
  // emitIntegrationPassCompleted
  // -------------------------------------------------------------------------

  describe('emitIntegrationPassCompleted', () => {
    it('emits log with integration-specific fields and promptTemplateId', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitIntegrationPassCompleted(ctx, {
        state: 'IntegrateIntoSpec',
        source: 'workflow-input',
        specPath: 'specs/todo.md',
        passNumber: 1,
        changeSummaryCount: 3,
        resolvedCount: 0,
        remainingCount: 2,
        promptTemplateId: TEMPLATE_IDS.integrate,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: IntegrationPassCompletedPayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.integrationPassCompleted);
      expect(call.payload.source).toBe('workflow-input');
      expect(call.payload.specPath).toBe('specs/todo.md');
      expect(call.payload.passNumber).toBe(1);
      expect(call.payload.changeSummaryCount).toBe(3);
      expect(call.payload.promptTemplateId).toBe(TEMPLATE_IDS.integrate);
      expect(payload.resolvedCount).toBe(0);
      expect(payload.remainingCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // emitConsistencyOutcome
  // -------------------------------------------------------------------------

  describe('emitConsistencyOutcome', () => {
    it('emits log with consistency-check-specific fields and promptTemplateId', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitConsistencyOutcome(ctx, {
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        blockingIssuesCount: 1,
        followUpQuestionsCount: 2,
        passNumber: 1,
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: ConsistencyOutcomePayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.consistencyOutcome);
      expect(call.payload.blockingIssuesCount).toBe(1);
      expect(call.payload.followUpQuestionsCount).toBe(2);
      expect(call.payload.passNumber).toBe(1);
      expect(call.payload.promptTemplateId).toBe(TEMPLATE_IDS.consistencyCheck);
      expect(payload.state).toBe('LogicalConsistencyCheckCreateFollowUpQuestions');
    });
  });

  // -------------------------------------------------------------------------
  // emitQuestionGenerated
  // -------------------------------------------------------------------------

  describe('emitQuestionGenerated', () => {
    it('emits log with question metadata', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitQuestionGenerated(ctx, {
        state: 'NumberedOptionsHumanRequest',
        questionId: 'q-scope-1',
        kind: 'issue-resolution',
        queuePosition: 0,
        queueSize: 3,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: QuestionGeneratedPayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.questionGenerated);
      expect(call.payload.questionId).toBe('q-scope-1');
      expect(call.payload.kind).toBe('issue-resolution');
      expect(call.payload.queuePosition).toBe(0);
      expect(call.payload.queueSize).toBe(3);
      expect(payload.state).toBe('NumberedOptionsHumanRequest');
    });
  });

  // -------------------------------------------------------------------------
  // emitResponseReceived
  // -------------------------------------------------------------------------

  describe('emitResponseReceived', () => {
    it('emits log with response details', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitResponseReceived(ctx, {
        state: 'NumberedOptionsHumanRequest',
        questionId: 'q-scope-1',
        selectedOptionIds: [2],
        hasCustomText: true,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: ResponseReceivedPayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.responseReceived);
      expect(call.payload.questionId).toBe('q-scope-1');
      expect(call.payload.selectedOptionIds).toEqual([2]);
      expect(call.payload.hasCustomText).toBe(true);
      expect(payload.state).toBe('NumberedOptionsHumanRequest');
    });

    it('reports hasCustomText false when no custom text', () => {
      const { ctx } = createMockContext();
      const payload = emitResponseReceived(ctx, {
        state: 'NumberedOptionsHumanRequest',
        questionId: 'q-1',
        selectedOptionIds: [1],
        hasCustomText: false,
      });
      expect(payload.hasCustomText).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // emitClassificationOutcome
  // -------------------------------------------------------------------------

  describe('emitClassificationOutcome', () => {
    it('emits log with classification intent and promptTemplateId', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitClassificationOutcome(ctx, {
        state: 'ClassifyCustomPrompt',
        questionId: 'q-scope-1',
        intent: 'custom-answer',
        promptTemplateId: TEMPLATE_IDS.classifyCustomPrompt,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: ClassificationOutcomePayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.classificationOutcome);
      expect(call.payload.questionId).toBe('q-scope-1');
      expect(call.payload.intent).toBe('custom-answer');
      expect(call.payload.promptTemplateId).toBe(TEMPLATE_IDS.classifyCustomPrompt);
      expect(payload.state).toBe('ClassifyCustomPrompt');
    });

    it('supports clarifying-question intent', () => {
      const { ctx } = createMockContext();
      const payload = emitClassificationOutcome(ctx, {
        state: 'ClassifyCustomPrompt',
        questionId: 'q-2',
        intent: 'clarifying-question',
        promptTemplateId: TEMPLATE_IDS.classifyCustomPrompt,
      });
      expect(payload.intent).toBe('clarifying-question');
    });
  });

  // -------------------------------------------------------------------------
  // emitClarificationGenerated
  // -------------------------------------------------------------------------

  describe('emitClarificationGenerated', () => {
    it('emits log with follow-up question details and promptTemplateId', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitClarificationGenerated(ctx, {
        state: 'ExpandQuestionWithClarification',
        sourceQuestionId: 'q-scope-1',
        followUpQuestionId: 'q-scope-1-c1',
        insertIndex: 2,
        promptTemplateId: TEMPLATE_IDS.expandClarification,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: ClarificationGeneratedPayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.clarificationGenerated);
      expect(call.payload.sourceQuestionId).toBe('q-scope-1');
      expect(call.payload.followUpQuestionId).toBe('q-scope-1-c1');
      expect(call.payload.insertIndex).toBe(2);
      expect(call.payload.promptTemplateId).toBe(TEMPLATE_IDS.expandClarification);
      expect(payload.state).toBe('ExpandQuestionWithClarification');
    });
  });

  // -------------------------------------------------------------------------
  // emitTerminalCompleted
  // -------------------------------------------------------------------------

  describe('emitTerminalCompleted', () => {
    it('emits log with terminal summary fields', () => {
      const { ctx, logSpy } = createMockContext();
      const payload = emitTerminalCompleted(ctx, {
        state: 'Done',
        specPath: 'specs/final.md',
        loopsUsed: 2,
        integrationPasses: 3,
        consistencyCheckPasses: 3,
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0][0] as {
        payload: TerminalCompletedPayload;
      };
      expect(call.payload.observabilityType).toBe(OBS_TYPES.terminalCompleted);
      expect(call.payload.specPath).toBe('specs/final.md');
      expect(call.payload.loopsUsed).toBe(2);
      expect(call.payload.integrationPasses).toBe(3);
      expect(call.payload.consistencyCheckPasses).toBe(3);
      expect(payload.state).toBe('Done');
    });
  });

  // -------------------------------------------------------------------------
  // Event sequence ordering
  // -------------------------------------------------------------------------

  describe('event sequence ordering', () => {
    it('events emitted in sequence produce monotonic call ordering', () => {
      const { ctx, logSpy } = createMockContext();

      emitDelegationStarted(ctx, {
        state: 'IntegrateIntoSpec',
        promptTemplateId: TEMPLATE_IDS.integrate,
        outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
      });

      emitIntegrationPassCompleted(ctx, {
        state: 'IntegrateIntoSpec',
        source: 'workflow-input',
        specPath: 'specs/test.md',
        passNumber: 1,
        changeSummaryCount: 3,
        resolvedCount: 0,
        remainingCount: 2,
        promptTemplateId: TEMPLATE_IDS.integrate,
      });

      emitDelegationStarted(ctx, {
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
        outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      });

      emitConsistencyOutcome(ctx, {
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        blockingIssuesCount: 1,
        followUpQuestionsCount: 2,
        passNumber: 1,
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      });

      emitQuestionGenerated(ctx, {
        state: 'NumberedOptionsHumanRequest',
        questionId: 'q-1',
        kind: 'issue-resolution',
        queuePosition: 0,
        queueSize: 2,
      });

      emitResponseReceived(ctx, {
        state: 'NumberedOptionsHumanRequest',
        questionId: 'q-1',
        selectedOptionIds: [1],
        hasCustomText: false,
      });

      emitTerminalCompleted(ctx, {
        state: 'Done',
        specPath: 'specs/test.md',
        loopsUsed: 1,
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      });

      // Verify monotonic call ordering
      expect(logSpy).toHaveBeenCalledTimes(7);
      const types = logSpy.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { payload: { observabilityType: string } }).payload.observabilityType,
      );
      expect(types).toEqual([
        OBS_TYPES.delegationStarted,
        OBS_TYPES.integrationPassCompleted,
        OBS_TYPES.delegationStarted,
        OBS_TYPES.consistencyOutcome,
        OBS_TYPES.questionGenerated,
        OBS_TYPES.responseReceived,
        OBS_TYPES.terminalCompleted,
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Template traceability
  // -------------------------------------------------------------------------

  describe('template traceability', () => {
    it('all four template IDs appear in delegation events', () => {
      const { ctx, logSpy } = createMockContext();

      const delegations = [
        {
          templateId: TEMPLATE_IDS.integrate,
          schemaId: SCHEMA_IDS.specIntegrationOutput,
          state: 'IntegrateIntoSpec',
        },
        {
          templateId: TEMPLATE_IDS.consistencyCheck,
          schemaId: SCHEMA_IDS.consistencyCheckOutput,
          state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        },
        {
          templateId: TEMPLATE_IDS.classifyCustomPrompt,
          schemaId: SCHEMA_IDS.customPromptClassificationOutput,
          state: 'ClassifyCustomPrompt',
        },
        {
          templateId: TEMPLATE_IDS.expandClarification,
          schemaId: SCHEMA_IDS.clarificationFollowUpOutput,
          state: 'ExpandQuestionWithClarification',
        },
      ] as const;

      for (const { templateId, schemaId, state } of delegations) {
        emitDelegationStarted(ctx, {
          state,
          promptTemplateId: templateId,
          outputSchemaId: schemaId,
        });
      }

      expect(logSpy).toHaveBeenCalledTimes(4);
      for (let i = 0; i < 4; i++) {
        const payload = (logSpy.mock.calls[i][0] as { payload: DelegationStartedPayload }).payload;
        expect(payload.promptTemplateId).toBe(delegations[i].templateId);
        expect(payload.outputSchemaId).toBe(delegations[i].schemaId);
      }
    });

    it('operation outcome events carry promptTemplateId for cross-reference', () => {
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

      emitConsistencyOutcome(ctx, {
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        blockingIssuesCount: 0,
        followUpQuestionsCount: 0,
        passNumber: 1,
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
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
        insertIndex: 2,
        promptTemplateId: TEMPLATE_IDS.expandClarification,
      });

      expect(logSpy).toHaveBeenCalledTimes(4);
      const templateIds = logSpy.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { payload: { promptTemplateId: string } }).payload.promptTemplateId,
      );
      expect(templateIds).toEqual([
        TEMPLATE_IDS.integrate,
        TEMPLATE_IDS.consistencyCheck,
        TEMPLATE_IDS.classifyCustomPrompt,
        TEMPLATE_IDS.expandClarification,
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // All payloads include base fields
  // -------------------------------------------------------------------------

  describe('base payload fields', () => {
    it('every emitter includes observabilityType and state in payload', () => {
      const { ctx, logSpy } = createMockContext();

      emitDelegationStarted(ctx, {
        state: 'S1',
        promptTemplateId: TEMPLATE_IDS.integrate,
        outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
      });
      emitIntegrationPassCompleted(ctx, {
        state: 'S2',
        source: 'workflow-input',
        specPath: 'x.md',
        passNumber: 1,
        changeSummaryCount: 0,
        resolvedCount: 0,
        remainingCount: 0,
        promptTemplateId: TEMPLATE_IDS.integrate,
      });
      emitConsistencyOutcome(ctx, {
        state: 'S3',
        blockingIssuesCount: 0,
        followUpQuestionsCount: 0,
        passNumber: 1,
        promptTemplateId: TEMPLATE_IDS.consistencyCheck,
      });
      emitQuestionGenerated(ctx, {
        state: 'S4',
        questionId: 'q',
        kind: 'issue-resolution',
        queuePosition: 0,
        queueSize: 1,
      });
      emitResponseReceived(ctx, {
        state: 'S5',
        questionId: 'q',
        selectedOptionIds: [1],
        hasCustomText: false,
      });
      emitClassificationOutcome(ctx, {
        state: 'S6',
        questionId: 'q',
        intent: 'custom-answer',
        promptTemplateId: TEMPLATE_IDS.classifyCustomPrompt,
      });
      emitClarificationGenerated(ctx, {
        state: 'S7',
        sourceQuestionId: 'q',
        followUpQuestionId: 'q-c1',
        insertIndex: 0,
        promptTemplateId: TEMPLATE_IDS.expandClarification,
      });
      emitTerminalCompleted(ctx, {
        state: 'S8',
        specPath: 'x.md',
        loopsUsed: 0,
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      });

      expect(logSpy).toHaveBeenCalledTimes(8);
      for (let i = 0; i < 8; i++) {
        const payload = (
          logSpy.mock.calls[i][0] as { payload: { observabilityType: string; state: string } }
        ).payload;
        expect(payload.observabilityType).toBeDefined();
        expect(typeof payload.observabilityType).toBe('string');
        expect(payload.state).toBe(`S${i + 1}`);
      }
    });
  });
});
