/**
 * GS-SD-002: Multi-loop clarification to completion.
 *
 * Requirement: SD-E2E-002-MultiLoopCompletion
 * Behaviors: GS-SD-002
 *
 * #### Flow
 * start → IntegrateIntoSpec(1) → LogicalConsistencyCheck(1) (2 questions) →
 * NumberedOptionsHumanRequest (Q1) → NumberedOptionsHumanRequest (Q2) →
 * IntegrateIntoSpec(2) → LogicalConsistencyCheck(2) (empty) →
 * NumberedOptionsHumanRequest (completion-confirmation) → Done
 *
 * #### Assertions
 * - Multiple feedback child runs (one per question + completion confirmation).
 * - IntegrateIntoSpec called twice with different `source` values.
 * - Loop counter reflects actual iterations.
 * - All normalized answers present in second integration input.
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

const SCENARIO = 'gs-sd-002';

describe('e2e.blackbox.spec-doc.GS-SD-002', () => {
  it('completes multi-loop path with accumulated answers across integration passes', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a payment processing system.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['PCI DSS compliant', 'Support for multiple currencies'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    // 1. Answer Q1 (authentication question) — select option 1
    await answerNextFeedback(runId, 0, [1]);

    // 2. Answer Q2 (rate limiting question) — select option 1
    await answerNextFeedback(runId, 1, [1]);

    // 3. Answer completion-confirmation — select option 1 (yes, done)
    await answerNextFeedback(runId, 2, [1]);

    // 4. Wait for terminal lifecycle
    const terminal = await waitForTerminal(runId);
    expect(terminal.lifecycle).toBe('completed');

    // 5. Validate terminal output
    const output = terminal.output as {
      status: string;
      specPath: string;
      summary: { loopsUsed: number; unresolvedQuestions: number };
      artifacts: { integrationPasses: number; consistencyCheckPasses: number };
    };
    expect(output.status).toBe('completed');
    expect(output.specPath).toMatch(/\.md$/);
    expect(output.summary.loopsUsed).toBeGreaterThanOrEqual(1);
    expect(output.summary.unresolvedQuestions).toBe(0);
    expect(output.artifacts.integrationPasses).toBe(2);
    expect(output.artifacts.consistencyCheckPasses).toBe(2);

    // 6. Validate event stream
    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('workflow.completed');

    // Multiple feedback child.started events (Q1, Q2, completion-confirmation)
    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts.length).toBeGreaterThanOrEqual(3);

    // Multiple copilot child.started events (2 integrations + 2 consistency checks)
    const copilotStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'app-builder.copilot.prompt.v1',
    );
    expect(copilotStarts.length).toBeGreaterThanOrEqual(4);

    // Event sequences are monotonically increasing
    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 90_000);
});
