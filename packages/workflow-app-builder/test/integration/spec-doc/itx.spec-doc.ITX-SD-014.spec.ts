/**
 * ITX-SD-014: Done state terminal output invariants across all completion paths.
 *
 * Behaviors: B-SD-DONE-001, B-SD-DONE-002, B-SD-DONE-003.
 *
 * Validates that reaching the Done state produces a terminal output with
 * status "completed", specPath ending in ".md", unresolvedQuestions === 0,
 * and accurate pass counters, regardless of which path led to completion.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { handleDone } from '../../../src/workflows/spec-doc/states/done.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../../../src/workflows/spec-doc/queue.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
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
  runFSM,
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

// ---------------------------------------------------------------------------
// Helper: build Done-ready state data
// ---------------------------------------------------------------------------

function makeDoneStateData(overrides?: Partial<SpecDocStateData>): SpecDocStateData {
  return {
    queue: [
      {
        ...makeQueueItem(COMPLETION_CONFIRMATION_QUESTION_ID, {
          kind: 'completion-confirmation' as const,
          prompt: 'Is the spec document complete and ready?',
          options: [
            { id: 1, label: 'Yes, done', description: 'Accept the spec.' },
            { id: 2, label: 'No, continue', description: 'Keep refining.' },
          ],
        }),
        answered: true,
      },
    ],
    queueIndex: 1,
    normalizedAnswers: [
      {
        questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
        selectedOptionIds: [1],
        answeredAt: '2026-01-15T10:00:00.000Z',
      },
    ],
    counters: {
      integrationPasses: 1,
      consistencyCheckPasses: 1,
    },
    artifacts: {
      specPath: 'docs/generated-spec.md',
    },
    ...overrides,
  };
}

describe('ITX-SD-014: Done state terminal output invariants', () => {
  describe('Single-loop completion path', () => {
    it('outputs status "completed" (B-SD-DONE-001)', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.failedError).toBeUndefined();
      expect(result.completedOutput).toBeDefined();
      expect(result.completedOutput!.status).toBe('completed');
    });

    it('specPath ends with .md (B-SD-DONE-002)', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput!.specPath).toMatch(/\.md$/);
    });

    it('unresolvedQuestions is 0 (B-SD-DONE-003)', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput!.summary.unresolvedQuestions).toBe(0);
    });

    it('artifacts include accurate pass counts', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        counters: {
          integrationPasses: 1,
          consistencyCheckPasses: 1,
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput!.artifacts.integrationPasses).toBe(1);
      expect(result.completedOutput!.artifacts.consistencyCheckPasses).toBe(1);
    });
  });

  describe('Multi-loop completion path', () => {
    it('outputs accurate counts after multiple integration and consistency passes', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        counters: {
          integrationPasses: 4,
          consistencyCheckPasses: 4,
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.failedError).toBeUndefined();
      expect(result.completedOutput).toBeDefined();
      expect(result.completedOutput!.status).toBe('completed');
      expect(result.completedOutput!.artifacts.integrationPasses).toBe(4);
      expect(result.completedOutput!.artifacts.consistencyCheckPasses).toBe(4);
    });

    it('specPath from later pass is preserved in output', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        artifacts: {
          specPath: 'docs/refined-spec-v3.md',
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput!.specPath).toBe('docs/refined-spec-v3.md');
      expect(result.completedOutput!.specPath).toMatch(/\.md$/);
    });
  });

  describe('Failure guards', () => {
    it('fails if completion-confirmation answer is missing', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        normalizedAnswers: [], // no completion confirmation answer
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeUndefined();
      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('completion-confirmation');
    });

    it('fails if specPath is not set', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        artifacts: {
          specPath: undefined as unknown as string,
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeUndefined();
      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('specPath');
    });

    it('fails if specPath does not end with .md', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        artifacts: {
          specPath: 'docs/spec.txt',
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeUndefined();
      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('.md');
    });

    it('fails if integrationPasses is 0', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        counters: {
          integrationPasses: 0,
          consistencyCheckPasses: 1,
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeUndefined();
      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('integrationPasses');
    });

    it('fails if consistencyCheckPasses is 0', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData({
        counters: {
          integrationPasses: 1,
          consistencyCheckPasses: 0,
        },
      });
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeUndefined();
      expect(result.failedError).toBeDefined();
      expect(result.failedError!.message).toContain('consistencyCheckPasses');
    });
  });

  describe('Full FSM path to completion', () => {
    it('single-loop: start → Integrate → Consistency → Options → Done (B-SD-DONE-001)', async () => {
      copilotDouble.reset({
        IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          {
            structuredOutput: makeConsistencyOutput({
              followUpQuestions: [], // empty → synthesized completion
            }),
          },
        ],
      });

      feedbackController.reset({
        [COMPLETION_CONFIRMATION_QUESTION_ID]: [
          { selectedOptionIds: [1] }, // "Yes, done"
        ],
      });

      const input = makeDefaultInput();
      const fsmResult = await runFSM(input, copilotDouble, feedbackController, obsSink);

      expect(fsmResult.failedError).toBeUndefined();
      expect(fsmResult.completedOutput).toBeDefined();

      const output = fsmResult.completedOutput!;
      expect(output.status).toBe('completed');
      expect(output.specPath).toMatch(/\.md$/);
      expect(output.summary.unresolvedQuestions).toBe(0);
      expect(output.artifacts.integrationPasses).toBe(1);
      expect(output.artifacts.consistencyCheckPasses).toBe(1);
    });

    it('multi-loop: start → Integrate → Consistency → Options(decline) → Integrate → … → Done', async () => {
      copilotDouble.reset({
        IntegrateIntoSpec: [
          { structuredOutput: makeIntegrationOutput() },
          { structuredOutput: makeIntegrationOutput({ specPath: 'docs/refined-spec.md' }) },
        ],
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          // First pass: empty follow-ups → completion confirmation
          {
            structuredOutput: makeConsistencyOutput({ followUpQuestions: [] }),
          },
          // Second pass: empty follow-ups → completion confirmation again
          {
            structuredOutput: makeConsistencyOutput({ followUpQuestions: [] }),
          },
        ],
      });

      feedbackController.reset({
        [COMPLETION_CONFIRMATION_QUESTION_ID]: [
          { selectedOptionIds: [2] }, // "No, continue" → IntegrateIntoSpec
          { selectedOptionIds: [1] }, // "Yes, done" → Done
        ],
      });

      const input = makeDefaultInput();
      const fsmResult = await runFSM(input, copilotDouble, feedbackController, obsSink);

      expect(fsmResult.failedError).toBeUndefined();
      expect(fsmResult.completedOutput).toBeDefined();

      const output = fsmResult.completedOutput!;
      expect(output.status).toBe('completed');
      expect(output.specPath).toBe('docs/refined-spec.md');
      expect(output.summary.unresolvedQuestions).toBe(0);
      expect(output.artifacts.integrationPasses).toBe(2);
      expect(output.artifacts.consistencyCheckPasses).toBe(2);
    });

    it('emits terminal completed observability event (B-SD-DONE-003)', () => {
      const input = makeDefaultInput();
      const stateData = makeDoneStateData();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      handleDone(ctx, stateData);

      expect(result.completedOutput).toBeDefined();

      const terminalEvents = obsSink.terminalCompletedEvents();
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0].state).toBe('Done');
      expect(terminalEvents[0].payload.specPath).toBe('docs/generated-spec.md');
    });
  });
});
