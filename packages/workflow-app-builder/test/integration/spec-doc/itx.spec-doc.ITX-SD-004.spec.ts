/**
 * ITX-SD-004: Loop counter enforcement at boundary.
 *
 * Behaviors: B-SD-LOOP-001, B-SD-LOOP-002.
 *
 * Validates that self-loop succeeds at exactly maxClarificationLoops and
 * fails at maxClarificationLoops + 1, with failure payload including
 * unresolved question details.
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

describe('ITX-SD-004: Loop counter enforcement at boundary', () => {
  const MAX_LOOPS = 2;

  /**
   * Build state data with a queue of N items, a given queueIndex, and
   * a given clarificationLoopsUsed count.
   */
  function makeLoopTestData(
    queueItems: string[],
    queueIndex: number,
    loopsUsed: number,
  ): SpecDocStateData {
    return {
      ...createInitialStateData(),
      queue: queueItems.map((id) => makeQueueItem(id)),
      queueIndex,
      counters: {
        clarificationLoopsUsed: loopsUsed,
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
      artifacts: {
        specPath: 'docs/generated-spec.md',
      },
    };
  }

  it('self-loop succeeds at exactly maxClarificationLoops (B-SD-LOOP-001)', async () => {
    // loopsUsed = MAX_LOOPS - 1, so newLoopsUsed = MAX_LOOPS (should pass)
    const stateData = makeLoopTestData(
      ['q-001', 'q-002', 'q-003'],
      0, // at first item
      MAX_LOOPS - 1, // one loop used, about to use one more
    );

    feedbackController.reset({
      'q-001': [{ selectedOptionIds: [1] }],
    });

    const input = makeDefaultInput({ maxClarificationLoops: MAX_LOOPS });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('NumberedOptionsHumanRequest');

    const nextData = result.transitions[0].data as SpecDocStateData;
    expect(nextData.counters.clarificationLoopsUsed).toBe(MAX_LOOPS);
  });

  it('self-loop fails at maxClarificationLoops + 1 (B-SD-LOOP-002)', async () => {
    // loopsUsed = MAX_LOOPS, so newLoopsUsed = MAX_LOOPS + 1 (should fail)
    const stateData = makeLoopTestData(
      ['q-001', 'q-002', 'q-003'],
      0, // at first item
      MAX_LOOPS, // already at max, next loop exceeds
    );

    feedbackController.reset({
      'q-001': [{ selectedOptionIds: [1] }],
    });

    const input = makeDefaultInput({ maxClarificationLoops: MAX_LOOPS });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(result.failedError).toBeDefined();
    expect(result.failedError!.message).toContain('maxClarificationLoops');
    expect(result.failedError!.message).toContain(String(MAX_LOOPS));
    expect(result.transitions).toHaveLength(0);
    expect(result.completedOutput).toBeUndefined();
  });

  it('loop counter accurately reflects self-loop count (B-SD-LOOP-001)', async () => {
    // Run multiple self-loops and verify counter increments correctly
    const input = makeDefaultInput({ maxClarificationLoops: 5 });

    // Q1 → self-loop (counter: 0→1)
    const stateData1 = makeLoopTestData(['q-001', 'q-002', 'q-003'], 0, 0);
    feedbackController.reset({ 'q-001': [{ selectedOptionIds: [1] }] });
    obsSink.reset();
    const { ctx: ctx1, result: r1 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(ctx1, stateData1);
    expect(r1.failedError).toBeUndefined();
    const data1 = r1.transitions[0].data as SpecDocStateData;
    expect(data1.counters.clarificationLoopsUsed).toBe(1);

    // Q2 → self-loop (counter: 1→2)
    feedbackController.reset({ 'q-002': [{ selectedOptionIds: [1] }] });
    obsSink.reset();
    const { ctx: ctx2, result: r2 } = createMockContext(
      input,
      copilotDouble,
      feedbackController,
      obsSink,
    );
    await handleNumberedOptionsHumanRequest(ctx2, data1);
    expect(r2.failedError).toBeUndefined();
    const data2 = r2.transitions[0].data as SpecDocStateData;
    expect(data2.counters.clarificationLoopsUsed).toBe(2);
  });

  it('queue exhaustion bypasses loop counter check (B-SD-LOOP-001)', async () => {
    // Even at max loops, exhausting the queue goes to IntegrateIntoSpec without checking
    const stateData = makeLoopTestData(
      ['q-001'], // only one item → exhausted after answering
      0,
      MAX_LOOPS, // already at max
    );

    feedbackController.reset({
      'q-001': [{ selectedOptionIds: [1] }],
    });

    const input = makeDefaultInput({ maxClarificationLoops: MAX_LOOPS });
    const { ctx, result } = createMockContext(input, copilotDouble, feedbackController, obsSink);

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Queue exhausted → IntegrateIntoSpec (not a failure)
    expect(result.failedError).toBeUndefined();
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].to).toBe('IntegrateIntoSpec');
  });
});
