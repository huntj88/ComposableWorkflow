/**
 * ITX-SD-011: Numbered question item schema compliance for generated questions.
 *
 * Behaviors: B-SD-SCHEMA-004, B-SD-SCHEMA-005, B-SD-SCHEMA-006.
 *
 * Validates that all generated question items satisfy schema requirements:
 * contiguous option IDs, Pros/Cons descriptions, correct kind values, and
 * completion-confirmation synthesis.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleLogicalConsistencyCheck } from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import { handleExpandQuestionWithClarification } from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
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
import { createQueueInspector, type QueueInspector } from '../harness/spec-doc/queue-inspector.js';
import {
  createMockContext,
  makeDefaultInput,
  makeQuestionItem,
  makeQueueItem,
  makeConsistencyOutput,
  makeStateDataAfterIntegration,
  makeClarificationFollowUpOutput,
} from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;
let queueInspector: QueueInspector;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
  queueInspector = createQueueInspector();
});

describe('ITX-SD-011: Numbered question item schema compliance', () => {
  describe('Consistency check questions', () => {
    it('option IDs are unique contiguous integers starting at 1 (B-SD-SCHEMA-004)', async () => {
      const questions = [
        makeQuestionItem('q-schema-001', {
          options: [
            { id: 1, label: 'A', description: 'Approach A. Pros: Fast. Cons: Risky.' },
            { id: 2, label: 'B', description: 'Approach B. Pros: Safe. Cons: Slow.' },
            { id: 3, label: 'C', description: 'Approach C. Pros: Flexible. Cons: Complex.' },
          ],
        }),
        makeQuestionItem('q-schema-002'),
      ];

      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: makeConsistencyOutput({ followUpQuestions: questions }) },
        ],
      });

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      for (const item of nextData.queue) {
        queueInspector.assertContiguousOptionIds(item);
      }
    });

    it('each option includes description with Pros/Cons content (B-SD-SCHEMA-006)', async () => {
      const questions = [makeQuestionItem('q-proscons-001'), makeQuestionItem('q-proscons-002')];

      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: makeConsistencyOutput({ followUpQuestions: questions }) },
        ],
      });

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      for (const item of nextData.queue) {
        for (const option of item.options) {
          expect(option.description).toBeDefined();
          expect(option.description).toContain('Pros:');
          expect(option.description).toContain('Cons:');
        }
      }
    });

    it('each consistency-check question has kind "issue-resolution" (B-SD-SCHEMA-004)', async () => {
      const questions = [makeQuestionItem('q-kind-001'), makeQuestionItem('q-kind-002')];

      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: makeConsistencyOutput({ followUpQuestions: questions }) },
        ],
      });

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      for (const item of nextData.queue) {
        expect(item.kind).toBe('issue-resolution');
      }
    });
  });

  describe('Completion confirmation question', () => {
    it('is synthesized when consistency output has empty followUpQuestions (B-SD-SCHEMA-006)', async () => {
      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          {
            structuredOutput: makeConsistencyOutput({
              followUpQuestions: [],
              blockingIssues: [],
            }),
          },
        ],
      });

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      expect(nextData.queue).toHaveLength(1);
      expect(nextData.queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
      expect(nextData.queue[0].kind).toBe('completion-confirmation');
    });

    it('completion confirmation has explicit "spec is done" option', async () => {
      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: makeConsistencyOutput({ followUpQuestions: [] }) },
        ],
      });

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);

      const nextData = result.transitions[0].data as SpecDocStateData;
      const confirmation = nextData.queue[0];

      // Must have at least 2 options
      expect(confirmation.options.length).toBeGreaterThanOrEqual(2);

      // First option should confirm completion
      const doneOption = confirmation.options.find((o) => o.id === 1);
      expect(doneOption).toBeDefined();
      expect(doneOption!.label.toLowerCase()).toContain('done');

      // All option IDs should be contiguous
      queueInspector.assertContiguousOptionIds(confirmation);
    });
  });

  describe('Clarification follow-up questions', () => {
    it('conform to base schema with kind "issue-resolution" (B-SD-SCHEMA-005)', async () => {
      const sourceQuestion = makeQueueItem('q-clar-schema');
      const stateData: SpecDocStateData = {
        queue: [{ ...sourceQuestion, answered: true }],
        queueIndex: 1,
        normalizedAnswers: [
          {
            questionId: 'q-clar-schema',
            selectedOptionIds: [1],
            text: 'Clarify',
            answeredAt: '2026-01-15T10:00:00.000Z',
          },
        ],
        counters: { integrationPasses: 1, consistencyCheckPasses: 1 },
        artifacts: { specPath: 'docs/generated-spec.md' },
        pendingClarification: {
          sourceQuestionId: 'q-clar-schema',
          intent: 'clarifying-question',
          customQuestionText: 'What is the schema?',
        },
      };

      copilotDouble.reset({
        ExpandQuestionWithClarification: [
          { structuredOutput: makeClarificationFollowUpOutput('q-clar-schema-fu') },
        ],
      });

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleExpandQuestionWithClarification(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      const followUp = nextData.queue.find((q) => q.questionId === 'q-clar-schema-fu');
      expect(followUp).toBeDefined();
      expect(followUp!.kind).toBe('issue-resolution');
      expect(followUp!.prompt).toBeDefined();
      expect(followUp!.options.length).toBeGreaterThanOrEqual(2);

      // Option IDs must be contiguous starting at 1
      queueInspector.assertContiguousOptionIds(followUp!);

      // Options must have descriptions with Pros/Cons
      for (const option of followUp!.options) {
        expect(option.description).toBeDefined();
        expect(option.description).toContain('Pros:');
        expect(option.description).toContain('Cons:');
      }
    });
  });
});
