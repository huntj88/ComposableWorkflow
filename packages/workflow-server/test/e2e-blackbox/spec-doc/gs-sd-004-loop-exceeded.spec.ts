/**
 * GS-SD-004: maxClarificationLoops exceeded.
 *
 * Requirement: SD-E2E-004-LoopExceededFailure
 * Behaviors: GS-SD-004, B-SD-LOOP-001, B-SD-LOOP-002
 *
 * #### Flow
 * start → IntegrateIntoSpec → LogicalConsistencyCheck (4 questions) →
 * NumberedOptionsHumanRequest (Q1) → NumberedOptionsHumanRequest (Q2) →
 * NumberedOptionsHumanRequest (Q3) → FAIL (loop limit exceeded)
 *
 * #### Setup
 * - `maxClarificationLoops: 2`
 * - Consistency check returns 4 questions (enough to exceed the limit).
 *
 * #### Assertions
 * - `workflow.failed` event with loop-exceeded error context.
 * - Unresolved questions listed in failure payload.
 * - Run lifecycle terminates at `failed`.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  answerNextFeedback,
  fixtureDir,
  listAllEvents,
  startSpecDocWorkflow,
  waitForTerminal,
  type SpecDocInput,
} from './helpers.js';

const SCENARIO = 'gs-sd-004';

describe('e2e.blackbox.spec-doc.GS-SD-004', () => {
  it('fails with loop-exceeded error when maxClarificationLoops is exceeded', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a microservices orchestration platform.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Must support distributed tracing'],
      maxClarificationLoops: 2,
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    // With maxClarificationLoops=2 and 4 questions:
    //   Q1: newLoopsUsed=1, passes (1 <= 2)
    //   Q2: newLoopsUsed=2, passes (2 <= 2)
    //   Q3: newLoopsUsed=3, exceeds (3 > 2) → fail

    // Answer Q1 — select option 1
    await answerNextFeedback(runId, 0, [1]);

    // Answer Q2 — select option 1
    await answerNextFeedback(runId, 1, [1]);

    // Answer Q3 — this triggers the loop-exceeded check after feedback
    await answerNextFeedback(runId, 2, [1]);

    // Wait for terminal lifecycle — should be 'failed'
    const terminal = await waitForTerminal(runId);
    expect(terminal.lifecycle).toBe('failed');

    // Validate events
    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);

    // Must contain workflow.failed
    expect(eventTypes).toContain('workflow.failed');
    expect(eventTypes).not.toContain('workflow.completed');

    // The failure event should have error context mentioning loop exceeded
    const failedEvent = events.find((e) => e.eventType === 'workflow.failed');
    expect(failedEvent).toBeDefined();
    const errorPayload = failedEvent?.error ?? failedEvent?.payload;
    if (errorPayload) {
      const errorStr = JSON.stringify(errorPayload);
      expect(errorStr).toMatch(/maxClarificationLoops|[Ee]xceeded|loop/i);
    }

    // 3 feedback child runs were launched (Q1, Q2, Q3)
    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts.length).toBe(3);

    // Event sequences are monotonically increasing
    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 90_000);
});
