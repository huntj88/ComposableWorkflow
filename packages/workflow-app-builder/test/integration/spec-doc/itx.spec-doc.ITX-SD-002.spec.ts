/**
 * ITX-SD-002: Question queue ordering determinism and stability.
 *
 * Behaviors: B-SD-QUEUE-001, B-SD-TRANS-004.
 *
 * Validates that the question queue is deterministically sorted by questionId
 * and that ordering is preserved identically after simulated recovery.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
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
import { createQueueInspector, type QueueInspector } from '../harness/spec-doc/queue-inspector.js';
import {
  createMockContext,
  makeDefaultInput,
  makeQuestionItem,
  makeConsistencyOutput,
  makeStateDataAfterIntegration,
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

describe('ITX-SD-002: Question queue ordering determinism and stability', () => {
  it('sorts questions by questionId deterministically (B-SD-QUEUE-001)', async () => {
    // Provide questions deliberately out of order
    const questions = [
      makeQuestionItem('q-charlie'),
      makeQuestionItem('q-alpha'),
      makeQuestionItem('q-bravo'),
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
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.queue).toHaveLength(3);

    // Verify deterministic ordering
    queueInspector.assertDeterministicOrder(nextData.queue);

    expect(nextData.queue[0].questionId).toBe('q-alpha');
    expect(nextData.queue[1].questionId).toBe('q-bravo');
    expect(nextData.queue[2].questionId).toBe('q-charlie');
  });

  it('produces identical queue order on repeated invocations (B-SD-QUEUE-001)', async () => {
    const questions = [
      makeQuestionItem('q-zulu'),
      makeQuestionItem('q-echo'),
      makeQuestionItem('q-mike'),
    ];

    const runs: string[][] = [];

    for (let i = 0; i < 3; i++) {
      copilotDouble.reset({
        LogicalConsistencyCheckCreateFollowUpQuestions: [
          { structuredOutput: makeConsistencyOutput({ followUpQuestions: questions }) },
        ],
      });
      obsSink.reset();

      const input = makeDefaultInput();
      const stateData = makeStateDataAfterIntegration();
      const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

      await handleLogicalConsistencyCheck(ctx, stateData);
      expect(result.failedError).toBeUndefined();

      const nextData = result.transitions[0].data as SpecDocStateData;
      runs.push(nextData.queue.map((q) => q.questionId));
    }

    // All runs must produce the same ordering
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[1]).toEqual(runs[2]);
  });

  it('preserves queue order after simulated recovery (B-SD-TRANS-004)', async () => {
    // Run 1: build the queue
    const questions = [
      makeQuestionItem('q-delta'),
      makeQuestionItem('q-alpha'),
      makeQuestionItem('q-charlie'),
      makeQuestionItem('q-bravo'),
    ];

    copilotDouble.reset({
      LogicalConsistencyCheckCreateFollowUpQuestions: [
        { structuredOutput: makeConsistencyOutput({ followUpQuestions: questions }) },
      ],
    });

    const input = makeDefaultInput();
    const stateData = makeStateDataAfterIntegration();
    const { ctx: ctx1, result: result1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );

    await handleLogicalConsistencyCheck(ctx1, stateData);
    const originalData = result1.transitions[0].data as SpecDocStateData;
    const originalSnapshot = queueInspector.snapshot(originalData.queue, 'original');

    // Simulate recovery: take the state data as-is and resume
    // This mimics what the engine does after crash + restart
    const recoveredData: SpecDocStateData = JSON.parse(JSON.stringify(originalData));
    const recoveredSnapshot = queueInspector.snapshot(recoveredData.queue, 'recovered');

    // Verify ordering is identical after recovery
    expect(recoveredSnapshot.items.map((i) => i.questionId)).toEqual(
      originalSnapshot.items.map((i) => i.questionId),
    );

    // No duplication
    const recoveredIds = recoveredData.queue.map((q) => q.questionId);
    expect(new Set(recoveredIds).size).toBe(recoveredIds.length);
  });

  it('does not reorder or duplicate questions after recovery mid-queue (B-SD-QUEUE-001)', async () => {
    const questions = [
      makeQuestionItem('q-foxtrot'),
      makeQuestionItem('q-alpha'),
      makeQuestionItem('q-echo'),
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
    const queueData = result.transitions[0].data as SpecDocStateData;

    // Simulate answering first question (advance index)
    const midQueueData: SpecDocStateData = {
      ...queueData,
      queueIndex: 1,
      queue: queueData.queue.map((q, i) => (i === 0 ? { ...q, answered: true } : q)),
    };

    // Serialize + deserialize to simulate recovery from persistence
    const recovered: SpecDocStateData = JSON.parse(JSON.stringify(midQueueData));

    // Verify: same ordering, no duplicates, first question still answered
    expect(recovered.queue.map((q) => q.questionId)).toEqual(
      queueData.queue.map((q) => q.questionId),
    );
    expect(recovered.queueIndex).toBe(1);
    expect(recovered.queue[0].answered).toBe(true);
    expect(recovered.queue[1].answered).toBe(false);
    expect(recovered.queue[2].answered).toBe(false);
  });
});
