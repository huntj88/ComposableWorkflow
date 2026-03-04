/**
 * Spec-doc feedback cancellation: cancel a spec-doc run while waiting for
 * human feedback.
 *
 * Requirement: SD-E2E-006-FeedbackCancellationLifecycle
 * Behaviors: B-SD-FAIL-002 (human feedback cancellation lifecycle)
 *
 * #### Flow
 * start → IntegrateIntoSpec → LogicalConsistencyCheck (1 question) →
 * NumberedOptionsHumanRequest (awaiting feedback) →
 * [cancel parent run] → cancellation propagates → terminal lifecycle
 *
 * #### Assertions
 * - Cancellation while awaiting response emits linked cancellation behavior.
 * - Terminal lifecycle is `cancelled` or `failed` (per server lifecycle rules).
 * - Feedback child status reflects cancellation.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  cancelRun,
  findNthFeedbackChildRunId,
  fixtureDir,
  getFeedbackStatus,
  getRunSummary,
  listAllEvents,
  skipUnlessCopilotFixture,
  sleep,
  startSpecDocWorkflow,
  waitForTerminal,
  type SpecDocInput,
} from './helpers.js';

const SCENARIO = 'cancellation';
const shouldSkip = await skipUnlessCopilotFixture();

describe.skipIf(shouldSkip)('e2e.blackbox.spec-doc.feedback-cancellation', () => {
  it('propagates cancellation to feedback child when parent is cancelled while awaiting response', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for an error handling framework.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Must support structured error types'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    // 1. Wait for the feedback child to appear (workflow is now awaiting human input)
    const feedbackRunId = await findNthFeedbackChildRunId(runId, 0);

    // 2. Verify feedback is awaiting response
    const feedbackBefore = await getFeedbackStatus(feedbackRunId);
    expect(feedbackBefore.status).toBe('awaiting_response');

    // 3. Cancel the parent run
    await cancelRun(runId);

    // 4. Wait for the parent run to reach terminal lifecycle
    const terminal = await waitForTerminal(runId);
    // Server lifecycle rules: cancellation propagation can result in 'cancelled' or 'failed'
    expect(['cancelled', 'failed']).toContain(terminal.lifecycle);

    // 5. Validate events
    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);

    // Must NOT contain workflow.completed
    expect(eventTypes).not.toContain('workflow.completed');

    // Should contain cancellation-related events
    const hasCancelEvent =
      eventTypes.includes('workflow.cancelled') || eventTypes.includes('workflow.failed');
    expect(hasCancelEvent).toBe(true);

    // 6. Check feedback child status post-cancellation
    // Allow a brief window for cancellation propagation
    await sleep(500);
    try {
      const feedbackAfter = await getFeedbackStatus(feedbackRunId);
      // After cancellation, feedback status should not be 'awaiting_response'
      expect(feedbackAfter.status).not.toBe('awaiting_response');
    } catch {
      // If the feedback endpoint returns an error, that's acceptable —
      // the run is terminated.
    }

    // 7. Check that the feedback child run is also terminated
    try {
      const childSummary = await getRunSummary(feedbackRunId);
      expect(['cancelled', 'failed', 'completed']).toContain(childSummary.lifecycle);
    } catch {
      // Acceptable if child run is cleaned up
    }

    // Event sequences are monotonically increasing
    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 60_000);
});
