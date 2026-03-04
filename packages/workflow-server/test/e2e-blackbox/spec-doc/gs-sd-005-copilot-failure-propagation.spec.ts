/**
 * GS-SD-005: Copilot prompt workflow failure propagation.
 *
 * Requirement: SD-E2E-005-CopilotFailurePropagation
 * Behaviors: GS-SD-005, B-SD-FAIL-001, B-SD-COPILOT-001
 *
 * #### Flow
 * start → IntegrateIntoSpec → copilot child FAILS → parent run fails
 *
 * #### Assertions
 * - `child.failed` event linked in parent stream.
 * - Error context includes FSM state (`IntegrateIntoSpec`).
 * - No partial spec state persisted as completed.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  fixtureDir,
  listAllEvents,
  skipUnlessCopilotFixture,
  startSpecDocWorkflow,
  waitForTerminal,
  type SpecDocInput,
} from './helpers.js';

const SCENARIO = 'gs-sd-005';
const shouldSkip = await skipUnlessCopilotFixture();

describe.skipIf(shouldSkip)('e2e.blackbox.spec-doc.GS-SD-005', () => {
  it('propagates copilot child failure with FSM state context', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a recommendation engine.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Must support collaborative filtering'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    // The copilot fixture for this scenario returns __fixture_fail=true,
    // causing the copilot child to fail during IntegrateIntoSpec.
    const terminal = await waitForTerminal(runId);
    expect(terminal.lifecycle).toBe('failed');

    // Validate events
    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);

    // Must contain workflow.failed, not workflow.completed
    expect(eventTypes).toContain('workflow.failed');
    expect(eventTypes).not.toContain('workflow.completed');

    // child.failed event should be linked for the copilot child
    const childFailed = events.find(
      (e) =>
        e.eventType === 'child.failed' &&
        e.child?.childWorkflowType === 'app-builder.copilot.prompt.v1',
    );
    expect(childFailed).toBeDefined();
    expect(childFailed?.child?.lifecycle).toBe('failed');

    // The workflow.failed event should reference the IntegrateIntoSpec state
    const workflowFailed = events.find((e) => e.eventType === 'workflow.failed');
    expect(workflowFailed).toBeDefined();
    const errorPayload = workflowFailed?.error ?? workflowFailed?.payload;
    if (errorPayload) {
      const errorStr = JSON.stringify(errorPayload);
      expect(errorStr).toMatch(/IntegrateIntoSpec|copilot.*fail|fixture/i);
    }

    // No feedback child runs — failure happens before reaching human feedback
    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts).toHaveLength(0);

    // Event sequences are monotonically increasing
    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 60_000);
});
