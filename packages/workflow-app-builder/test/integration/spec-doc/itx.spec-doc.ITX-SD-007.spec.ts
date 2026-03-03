/**
 * ITX-SD-007: IntegrateIntoSpec input normalization across passes.
 *
 * Behaviors: B-SD-INPUT-001, B-SD-INPUT-002, B-SD-INPUT-003, B-SD-TRANS-006.
 *
 * Validates that first-pass input uses source="workflow-input" and subsequent
 * passes use source="numbered-options-feedback" with normalized answers and
 * prior specPath.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createInitialStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleIntegrateIntoSpec } from '../../../src/workflows/spec-doc/states/integrate-into-spec.js';
import { createCopilotDouble, type CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import {
  createFeedbackController,
  type FeedbackController,
} from '../harness/spec-doc/feedback-controller.js';
import {
  createObservabilitySink,
  type ObservabilitySink,
} from '../harness/spec-doc/observability-sink.js';
import { createMockContext, makeDefaultInput, makeIntegrationOutput } from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-007: IntegrateIntoSpec input normalization across passes', () => {
  it('first pass sends source="workflow-input" with no answers (B-SD-INPUT-001)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const input = makeDefaultInput();
    const stateData = createInitialStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();

    // Inspect copilot call to verify interpolation variables
    const call = copilotDouble.calls[0];
    expect(call).toBeDefined();

    // The prompt should contain source: workflow-input
    expect(call.prompt).toContain('workflow-input');
    // First pass has empty answers
    expect(call.prompt).toContain('[]');
    // Request is from workflow input
    expect(call.prompt).toContain(input.request);
  });

  it('second pass sends source="numbered-options-feedback" with populated answers (B-SD-INPUT-002)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [
        { structuredOutput: makeIntegrationOutput({ specPath: 'docs/updated-spec.md' }) },
      ],
    });

    const stateData: SpecDocStateData = {
      ...createInitialStateData(),
      normalizedAnswers: [
        {
          questionId: 'q-answered-001',
          selectedOptionIds: [1],
          answeredAt: '2026-01-15T10:00:00.000Z',
        },
        {
          questionId: 'q-answered-002',
          selectedOptionIds: [2],
          text: 'Custom note',
          answeredAt: '2026-01-15T10:01:00.000Z',
        },
      ],
      counters: {
        clarificationLoopsUsed: 1,
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
      artifacts: {
        specPath: 'docs/generated-spec.md',
        lastIntegrationOutput: makeIntegrationOutput(),
      },
    };

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();

    const call = copilotDouble.calls[0];
    expect(call).toBeDefined();

    // Second pass should contain numbered-options-feedback source
    expect(call.prompt).toContain('numbered-options-feedback');
    // Should contain the existing specPath
    expect(call.prompt).toContain('docs/generated-spec.md');
    // Should contain serialized answers
    expect(call.prompt).toContain('q-answered-001');
    expect(call.prompt).toContain('q-answered-002');
    expect(call.prompt).toContain('Custom note');
  });

  it('normalized answers include all required fields (B-SD-INPUT-003)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const answers = [
      {
        questionId: 'q-validate-001',
        selectedOptionIds: [1, 3],
        answeredAt: '2026-01-15T10:00:00.000Z',
      },
      {
        questionId: 'q-validate-002',
        selectedOptionIds: [2],
        text: 'Additional context here',
        answeredAt: '2026-01-15T10:01:00.000Z',
      },
    ];

    const stateData: SpecDocStateData = {
      ...createInitialStateData(),
      normalizedAnswers: answers,
      counters: { clarificationLoopsUsed: 1, integrationPasses: 1, consistencyCheckPasses: 1 },
      artifacts: { specPath: 'docs/generated-spec.md' },
    };

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();

    // Parse the answers from the copilot call prompt
    const call = copilotDouble.calls[0];
    const answersJson = JSON.stringify(answers);
    expect(call.prompt).toContain(answersJson);

    // Verify each answer has required fields
    for (const ans of answers) {
      expect(ans.questionId).toBeDefined();
      expect(ans.selectedOptionIds).toBeDefined();
      expect(ans.answeredAt).toBeDefined();
    }
  });

  it('increments integrationPasses counter on each pass (B-SD-TRANS-006)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const stateData: SpecDocStateData = {
      ...createInitialStateData(),
      counters: { clarificationLoopsUsed: 0, integrationPasses: 2, consistencyCheckPasses: 2 },
      normalizedAnswers: [
        { questionId: 'q-1', selectedOptionIds: [1], answeredAt: '2026-01-15T10:00:00.000Z' },
      ],
      artifacts: { specPath: 'docs/generated-spec.md' },
    };

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.counters.integrationPasses).toBe(3);
  });

  it('persists specPath from integration output in artifacts (B-SD-INPUT-002)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [
        { structuredOutput: makeIntegrationOutput({ specPath: 'docs/new-spec-draft.md' }) },
      ],
    });

    const input = makeDefaultInput();
    const stateData = createInitialStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.artifacts.specPath).toBe('docs/new-spec-draft.md');
    expect(nextData.artifacts.lastIntegrationOutput).toBeDefined();
    expect(nextData.artifacts.lastIntegrationOutput!.specPath).toBe('docs/new-spec-draft.md');
  });

  it('always transitions to LogicalConsistencyCheckCreateFollowUpQuestions', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ structuredOutput: makeIntegrationOutput() }],
    });

    const input = makeDefaultInput();
    const stateData = createInitialStateData();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('LogicalConsistencyCheckCreateFollowUpQuestions');
  });
});
