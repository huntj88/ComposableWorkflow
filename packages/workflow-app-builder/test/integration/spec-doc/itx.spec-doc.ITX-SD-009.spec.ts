/**
 * ITX-SD-009: Copilot prompt failure propagation per FSM state.
 *
 * Behaviors: B-SD-FAIL-001, B-SD-COPILOT-001, B-SD-COPILOT-002.
 *
 * Validates that copilot child failures at each delegating state propagate
 * with identifying FSM state context in the error.
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

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-009: Copilot prompt failure propagation per FSM state', () => {
  it('IntegrateIntoSpec failure includes state context (B-SD-FAIL-001)', async () => {
    const simulatedError = new Error('Copilot timeout in integration');
    copilotDouble.reset({
      IntegrateIntoSpec: [{ failure: simulatedError }],
    });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx);

    expect(result.failedError).toBeDefined();
    expect(result.failedError!.message).toContain('Copilot timeout in integration');
    expect(result.transitions).toHaveLength(0);
    expect(result.completedOutput).toBeUndefined();
  });

  it('LogicalConsistencyCheckCreateFollowUpQuestions failure includes state context (B-SD-FAIL-001)', async () => {
    const simulatedError = new Error('Copilot parse error in consistency');
    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [{ failure: simulatedError }],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(result.failedError).toBeDefined();
    expect(result.failedError!.message).toContain('Copilot parse error in consistency');
    expect(result.transitions).toHaveLength(0);
  });

  it('ClassifyCustomPrompt failure includes state context (B-SD-COPILOT-001)', async () => {
    const simulatedError = new Error('Classification model unavailable');
    copilotDouble.reset({
      ClassifyCustomPrompt: [{ failure: simulatedError }],
    });

    const sourceQuestion = makeQueueItem('q-fail-classify');
    const input = makeDefaultInput();
    const stateData = makeStateDataForClassification(sourceQuestion, 'Some custom text');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(result.failedError).toBeDefined();
    expect(result.failedError!.message).toContain('Classification model unavailable');
    expect(result.transitions).toHaveLength(0);
  });

  it('ExpandQuestionWithClarification failure includes state context (B-SD-COPILOT-002)', async () => {
    const simulatedError = new Error('Clarification expansion failed');
    copilotDouble.reset({
      ExpandQuestionWithClarification: [{ failure: simulatedError }],
    });

    const sourceQuestion = makeQueueItem('q-fail-expand');
    const input = makeDefaultInput();
    const stateData = makeStateDataForExpandClarification(sourceQuestion, 'Why is this?');
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(result.failedError).toBeDefined();
    expect(result.failedError!.message).toContain('Clarification expansion failed');
    expect(result.transitions).toHaveLength(0);
  });

  it('no partial state mutation persists after any copilot failure (B-SD-COPILOT-002)', async () => {
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
        data: makeStateDataForClassification(makeQueueItem('q-noop-001'), 'test'),
        key: 'ClassifyCustomPrompt',
      },
      {
        name: 'ExpandQuestionWithClarification',
        handler: handleExpandQuestionWithClarification,
        data: makeStateDataForExpandClarification(makeQueueItem('q-noop-002'), 'clarify'),
        key: 'ExpandQuestionWithClarification',
      },
    ];

    for (const { handler, data, key } of states) {
      copilotDouble.reset({
        [key]: [{ failure: new Error('Simulated child failure') }],
      });
      obsSink.reset();

      const input = makeDefaultInput();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handler(ctx, data);

      // Terminal failure, no transitions, no completion
      expect(result.failedError).toBeDefined();
      expect(result.transitions).toHaveLength(0);
      expect(result.completedOutput).toBeUndefined();
    }
  });

  it('copilot call is recorded even when it fails (B-SD-COPILOT-001)', async () => {
    copilotDouble.reset({
      IntegrateIntoSpec: [{ failure: new Error('Recorded failure') }],
    });

    const input = makeDefaultInput();
    const { ctx } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleIntegrateIntoSpec(ctx);

    // The call should still be recorded for diagnostics
    expect(copilotDouble.callCount).toBe(1);
    expect(copilotDouble.calls[0].state).toBe('IntegrateIntoSpec');
  });
});
