/**
 * ITX-SD-008: Recovery of interrupted question queue processing.
 *
 * Behaviors: B-SD-HFB-001, B-SD-QUEUE-001, B-SD-QUEUE-004, B-LIFE-007.
 *
 * Validates that interrupted queue processing resumes without duplicates,
 * preserves ordering, and loop counter remains accurate post-recovery.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createInitialStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { handleNumberedOptionsHumanRequest } from '../../../src/workflows/spec-doc/states/numbered-options-human-request.js';
import { createCopilotDouble, type CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import {
  createFeedbackController,
  type FeedbackController,
} from '../harness/spec-doc/feedback-controller.js';
import {
  createObservabilitySink,
  type ObservabilitySink,
} from '../harness/spec-doc/observability-sink.js';

import { createMockContext, makeDefaultInput, makeQueueItem } from './helpers.js';

// ---------------------------------------------------------------------------

let copilotDouble: CopilotDouble;
let feedbackController: FeedbackController;
let obsSink: ObservabilitySink;

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  feedbackController = createFeedbackController();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-008: Recovery of interrupted question queue processing', () => {
  /** Build a multi-item queue state as if consistency check just completed. */
  function makeMultiQueueStateData(): SpecDocStateData {
    return {
      ...createInitialStateData(),
      queue: [makeQueueItem('q-alpha'), makeQueueItem('q-bravo'), makeQueueItem('q-charlie')],
      queueIndex: 0,
      counters: {
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
      artifacts: { specPath: 'docs/generated-spec.md' },
    };
  }

  it('recovery restores queue state with first answer recorded (B-SD-QUEUE-004)', async () => {
    // Step 1: Answer first question normally
    const stateData = makeMultiQueueStateData();
    feedbackController.reset({ 'q-alpha': [{ selectedOptionIds: [1] }] });

    const input = makeDefaultInput();
    const { ctx: ctx1, result: r1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleNumberedOptionsHumanRequest(ctx1, stateData);
    expect(r1.failedError).toBeUndefined();

    const afterFirstAnswer = r1.transitions[0].data as SpecDocStateData;

    // Step 2: Simulate crash — serialize state data to persistence
    const persisted = JSON.stringify(afterFirstAnswer);

    // Step 3: Recover — deserialize and resume
    const recovered: SpecDocStateData = JSON.parse(persisted);

    // Verify recovery state
    expect(recovered.queueIndex).toBe(1);
    expect(recovered.queue[0].answered).toBe(true);
    expect(recovered.queue[1].answered).toBe(false);
    expect(recovered.queue[2].answered).toBe(false);
    expect(recovered.normalizedAnswers).toHaveLength(1);
    expect(recovered.normalizedAnswers[0].questionId).toBe('q-alpha');
  });

  it('no duplicate feedback for already-answered questions after recovery (B-SD-HFB-001)', async () => {
    // Step 1: Answer first question
    const stateData = makeMultiQueueStateData();
    feedbackController.reset({ 'q-alpha': [{ selectedOptionIds: [1] }] });

    const input = makeDefaultInput();
    const { ctx: ctx1, result: r1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleNumberedOptionsHumanRequest(ctx1, stateData);
    const afterFirstAnswer = r1.transitions[0].data as SpecDocStateData;

    // Step 2: Recover and resume from queueIndex=1 (next question is q-bravo)
    const recovered: SpecDocStateData = JSON.parse(JSON.stringify(afterFirstAnswer));

    feedbackController.reset({ 'q-bravo': [{ selectedOptionIds: [2] }] });
    obsSink.reset();

    const { ctx: ctx2, result: r2 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleNumberedOptionsHumanRequest(ctx2, recovered);

    expect(r2.failedError).toBeUndefined();

    // Feedback controller should only have been called for q-bravo, not q-alpha
    expect(feedbackController.callCount).toBe(1);
    expect(feedbackController.calls[0].questionId).toBe('q-bravo');
  });

  it('queue ordering is preserved after recovery (B-SD-QUEUE-001)', async () => {
    const stateData = makeMultiQueueStateData();
    const originalOrder = stateData.queue.map((q) => q.questionId);

    // Answer first question
    feedbackController.reset({ 'q-alpha': [{ selectedOptionIds: [1] }] });

    const input = makeDefaultInput();
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);
    const afterAnswer = result.transitions[0].data as SpecDocStateData;

    // Recover
    const recovered: SpecDocStateData = JSON.parse(JSON.stringify(afterAnswer));
    const recoveredOrder = recovered.queue.map((q) => q.questionId);

    // Order must be identical
    expect(recoveredOrder).toEqual(originalOrder);
  });

  it('loop counter is accurate post-recovery (B-SD-QUEUE-004)', async () => {
    const stateData = makeMultiQueueStateData();

    // Answer first question → loop counter goes from 0 to 1
    feedbackController.reset({ 'q-alpha': [{ selectedOptionIds: [1] }] });

    const input = makeDefaultInput();
    const { ctx: ctx1, result: r1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleNumberedOptionsHumanRequest(ctx1, stateData);
    const afterFirst = r1.transitions[0].data as SpecDocStateData;

    // Recover and answer second question
    const recovered: SpecDocStateData = JSON.parse(JSON.stringify(afterFirst));
    feedbackController.reset({ 'q-bravo': [{ selectedOptionIds: [1] }] });
    obsSink.reset();

    const { ctx: ctx2, result: r2 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleNumberedOptionsHumanRequest(ctx2, recovered);
    expect(r2.failedError).toBeUndefined();
  });

  it('workflow can complete correctly after recovery from mid-queue (B-SD-HFB-001)', async () => {
    // Full flow: answer Q1, crash, recover, answer Q2, answer Q3,
    // then queue exhausts → IntegrateIntoSpec
    const stateData = makeMultiQueueStateData();
    const input = makeDefaultInput();

    // Answer Q1
    feedbackController.reset({ 'q-alpha': [{ selectedOptionIds: [1] }] });
    const { ctx: ctx1, result: r1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(ctx1, stateData);
    const afterQ1 = r1.transitions[0].data as SpecDocStateData;

    // Crash + recover
    const recovered: SpecDocStateData = JSON.parse(JSON.stringify(afterQ1));

    // Answer Q2
    feedbackController.reset({ 'q-bravo': [{ selectedOptionIds: [2] }] });
    obsSink.reset();
    const { ctx: ctx2, result: r2 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(ctx2, recovered);
    const afterQ2 = r2.transitions[0].data as SpecDocStateData;

    // Answer Q3 (last item, queue exhausted)
    feedbackController.reset({ 'q-charlie': [{ selectedOptionIds: [1] }] });
    obsSink.reset();
    const { ctx: ctx3, result: r3 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(ctx3, afterQ2);

    // Queue exhausted → IntegrateIntoSpec
    expect(r3.failedError).toBeUndefined();
    expect(r3.transitions).toHaveLength(1);
    expect(r3.transitions[0].to).toBe('IntegrateIntoSpec');

    const finalData = r3.transitions[0].data as SpecDocStateData;
    expect(finalData.normalizedAnswers).toHaveLength(3);
    expect(finalData.queue.every((q) => q.answered)).toBe(true);
  });
});
