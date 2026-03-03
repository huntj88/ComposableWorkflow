/**
 * ITX-SD-001: Schema validation failure modes per FSM state.
 *
 * Behaviors: B-SD-SCHEMA-001, B-SD-SCHEMA-002, B-SD-SCHEMA-003.
 *
 * Validates that non-JSON output and schema-mismatched JSON are terminal
 * failures with diagnostic context at each copilot-delegating state.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { handleIntegrateIntoSpec } from '../../../src/workflows/spec-doc/states/integrate-into-spec.js';
import { handleLogicalConsistencyCheck } from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import { handleClassifyCustomPrompt } from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
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
  makeStateDataAfterIntegration,
  makeStateDataForClassification,
  makeStateDataForExpandClarification,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

// ---------------------------------------------------------------------------
// IntegrateIntoSpec
// ---------------------------------------------------------------------------

describe('ITX-SD-001: Schema validation failure modes per FSM state', () => {
  describe('IntegrateIntoSpec', () => {
    it('fails with delegation error when copilot returns null structuredOutput (B-SD-SCHEMA-002)', async () => {
      copilotDouble.reset({
        IntegrateIntoSpec: [{ structuredOutput: null }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleIntegrateIntoSpec(ctx);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('did not return structuredOutput');
      expect(result.transitions).toHaveLength(0);
      expect(result.completedOutput).toBeUndefined();
    });

    it('fails with schema validation error on schema-mismatched JSON (B-SD-SCHEMA-003)', async () => {
      copilotDouble.reset({
        IntegrateIntoSpec: [{ structuredOutput: { wrong: 'data' } }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleIntegrateIntoSpec(ctx);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('schema validation failed');
      expect(result.failedError!.message).toContain('IntegrateIntoSpec');
      expect(result.transitions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // LogicalConsistencyCheckCreateFollowUpQuestions
  // ---------------------------------------------------------------------------

  describe('LogicalConsistencyCheckCreateFollowUpQuestions', () => {
    it('fails with delegation error when copilot returns null structuredOutput (B-SD-SCHEMA-002)', async () => {
      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [{ structuredOutput: null }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataAfterIntegration();

      await handleLogicalConsistencyCheck(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('did not return structuredOutput');
      expect(result.transitions).toHaveLength(0);
    });

    it('fails with schema validation error on schema-mismatched JSON (B-SD-SCHEMA-003)', async () => {
      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: { invalid: 'payload' } },
        ],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataAfterIntegration();

      await handleLogicalConsistencyCheck(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('schema validation failed');
      expect(result.failedError!.message).toContain(
        'LogicalConsistencyCheckCreateFollowUpQuestions',
      );
      expect(result.transitions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ClassifyCustomPrompt
  // ---------------------------------------------------------------------------

  describe('ClassifyCustomPrompt', () => {
    const sourceQuestion = makeQueueItem('q-source-001');

    it('fails with delegation error when copilot returns null structuredOutput (B-SD-SCHEMA-002)', async () => {
      copilotDouble.reset({
        ClassifyCustomPrompt: [{ structuredOutput: null }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataForClassification(sourceQuestion, 'What does this mean?');

      await handleClassifyCustomPrompt(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('did not return structuredOutput');
      expect(result.transitions).toHaveLength(0);
    });

    it('fails with schema validation error on schema-mismatched JSON (B-SD-SCHEMA-003)', async () => {
      copilotDouble.reset({
        ClassifyCustomPrompt: [{ structuredOutput: { bad: 'schema' } }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataForClassification(sourceQuestion, 'What does this mean?');

      await handleClassifyCustomPrompt(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('schema validation failed');
      expect(result.failedError!.message).toContain('ClassifyCustomPrompt');
      expect(result.transitions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ExpandQuestionWithClarification
  // ---------------------------------------------------------------------------

  describe('ExpandQuestionWithClarification', () => {
    const sourceQuestion = makeQueueItem('q-expand-001');

    it('fails with delegation error when copilot returns null structuredOutput (B-SD-SCHEMA-002)', async () => {
      copilotDouble.reset({
        ExpandQuestionWithClarification: [{ structuredOutput: null }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataForExpandClarification(sourceQuestion, 'Please clarify');

      await handleExpandQuestionWithClarification(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('did not return structuredOutput');
      expect(result.transitions).toHaveLength(0);
    });

    it('fails with schema validation error on schema-mismatched JSON (B-SD-SCHEMA-003)', async () => {
      copilotDouble.reset({
        ExpandQuestionWithClarification: [{ structuredOutput: { nope: 'wrong' } }],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);
      const stateData = makeStateDataForExpandClarification(sourceQuestion, 'Please clarify');

      await handleExpandQuestionWithClarification(ctx, stateData);

      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('schema validation failed');
      expect(result.failedError!.message).toContain('ExpandQuestionWithClarification');
      expect(result.transitions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-cutting: no partial state mutation after failure
  // ---------------------------------------------------------------------------

  describe('Cross-cutting invariants', () => {
    it('no transition is emitted on any schema failure path (B-SD-SCHEMA-001)', async () => {
      // Test all four states at once: each should fail without transitioning
      const states = [
        {
          name: 'IntegrateIntoSpec',
          handler: handleIntegrateIntoSpec,
          data: undefined,
          key: 'IntegrateIntoSpec',
        },
        {
          name: 'LogicalConsistencyCheck',
          handler: handleLogicalConsistencyCheck,
          data: makeStateDataAfterIntegration(),
          key: 'LogicalConsistencyCheckCreateFollowUpQuestions',
        },
        {
          name: 'ClassifyCustomPrompt',
          handler: handleClassifyCustomPrompt,
          data: makeStateDataForClassification(makeQueueItem('q-cross-001'), 'custom'),
          key: 'ClassifyCustomPrompt',
        },
        {
          name: 'ExpandQuestionWithClarification',
          handler: handleExpandQuestionWithClarification,
          data: makeStateDataForExpandClarification(makeQueueItem('q-cross-002'), 'clarify'),
          key: 'ExpandQuestionWithClarification',
        },
      ];

      for (const { handler, data, key } of states) {
        copilotDouble.reset({ [key]: [{ structuredOutput: { invalid: true } }] });
        obsSink.reset();

        const input = makeDefaultInput();
        const { ctx, result } = createMockContext(
          input,
          copilotDouble,
          feedbackController,
          obsSink,
        );

        await handler(ctx, data);

        expect(result.transitions).toHaveLength(0);
        expect(result.failedError).toBeDefined();
        expect(result.completedOutput).toBeUndefined();
      }
    });
  });
});
