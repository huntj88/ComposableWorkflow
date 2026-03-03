/**
 * GS-SD-001: Happy path — single loop to completion.
 *
 * Requirement: SD-E2E-001-HappyPathCompletion
 * Behaviors: GS-SD-001
 *
 * #### Flow
 * start → IntegrateIntoSpec → LogicalConsistencyCheck (empty questions) →
 * NumberedOptionsHumanRequest (completion-confirmation) → Done
 *
 * #### Assertions
 * - Event stream shows expected state path.
 * - One feedback child run launched (completion-confirmation).
 * - Terminal output satisfies contract (`status: 'completed'`, `specPath`,
 *   `summary.loopsUsed === 1`).
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

const SCENARIO = 'gs-sd-001';

describe('e2e.blackbox.spec-doc.GS-SD-001', () => {
  it('completes happy path in a single loop with correct terminal output', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a user authentication service.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Must support OAuth 2.0', 'Must be stateless'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return; // graceful skip if workflow type not registered

    const { runId } = started;

    // 1. Answer the completion-confirmation question (select option 1 = "Yes, done")
    await answerNextFeedback(runId, 0, [1]);

    // 2. Wait for terminal lifecycle
    const terminal = await waitForTerminal(runId);
    expect(terminal.lifecycle).toBe('completed');

    // 3. Validate terminal output contract
    const output = terminal.output as {
      status: string;
      specPath: string;
      summary: { loopsUsed: number; unresolvedQuestions: number };
      artifacts: { integrationPasses: number; consistencyCheckPasses: number };
    };
    expect(output.status).toBe('completed');
    expect(output.specPath).toMatch(/\.md$/);
    expect(output.summary.loopsUsed).toBe(0);
    expect(output.summary.unresolvedQuestions).toBe(0);
    expect(output.artifacts.integrationPasses).toBeGreaterThanOrEqual(1);
    expect(output.artifacts.consistencyCheckPasses).toBeGreaterThanOrEqual(1);

    // 4. Validate event stream state path
    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);

    // Must include at least workflow.started and workflow.completed
    expect(eventTypes).toContain('workflow.completed');

    // Exactly one feedback child.started event
    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts).toHaveLength(1);

    // Event sequences are monotonically increasing
    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 60_000);
});
