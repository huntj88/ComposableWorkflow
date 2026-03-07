/**
 * GS-SD-004: Immediate-action child result short-circuits back to integration.
 *
 * Requirement: SD-E2E-004-ImmediateActionParity
 * Behaviors: GS-SD-004
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  answerNextFeedback,
  fixtureDir,
  listAllEvents,
  skipUnlessCopilotFixture,
  startSpecDocWorkflow,
  waitForTerminal,
  type SpecDocInput,
} from './helpers.js';

const SCENARIO = 'gs-sd-004';
const shouldSkip = await skipUnlessCopilotFixture();

const EXPECTED_ACTIONABLE_ITEMS = [
  {
    itemId: 'act-sd-004-001',
    instruction:
      'Rewrite the scope section so that the supported user roles and exclusions are explicit.',
    rationale: 'The current draft leaves the primary operator persona ambiguous.',
    targetSection: 'Scope',
    blockingIssueIds: ['bi-sd-004-immediate-001'],
  },
  {
    itemId: 'act-sd-004-002',
    instruction:
      'Add acceptance criteria that define rollback safety checks for the deployment workflow.',
    rationale:
      'The workflow needs a testable definition of safe completion before implementation starts.',
    targetSection: 'Acceptance Criteria',
    blockingIssueIds: ['bi-sd-004-immediate-001'],
  },
];

describe.skipIf(shouldSkip)('e2e.blackbox.spec-doc.GS-SD-004', () => {
  it('proves the immediate-action path loops back to integration before any feedback child launches', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a deployment orchestration workflow.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Must support rollback safety checks', 'Must document operator personas'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    await answerNextFeedback(runId, 0, [1]);

    const terminal = await waitForTerminal(runId);
    expect(terminal.lifecycle).toBe('completed');

    const output = terminal.output as {
      status: string;
      specPath: string;
      summary: { unresolvedQuestions: number };
      artifacts: { integrationPasses: number; consistencyCheckPasses: number };
    };
    expect(output.status).toBe('completed');
    expect(output.specPath).toMatch(/\.md$/);
    expect(output.summary.unresolvedQuestions).toBe(0);
    expect(output.artifacts.integrationPasses).toBe(2);
    expect(output.artifacts.consistencyCheckPasses).toBe(2);

    const events = await listAllEvents(runId);
    const feedbackStarts = events.filter(
      (event) =>
        event.eventType === 'child.started' &&
        event.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts).toHaveLength(1);

    const immediateTransition = events.find((event) => {
      if (event.eventType !== 'transition.completed' || !event.payload) return false;
      const payload = event.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown> | null;
      return (
        payload.from === 'LogicalConsistencyCheckCreateFollowUpQuestions' &&
        payload.to === 'IntegrateIntoSpec' &&
        data?.source === 'consistency-action-items'
      );
    });

    expect(immediateTransition).toBeDefined();
    const immediateTransitionPayload = immediateTransition?.payload as Record<string, unknown>;
    const immediateTransitionData = immediateTransitionPayload.data as Record<string, unknown>;
    expect(immediateTransitionData.actionableItems).toEqual(EXPECTED_ACTIONABLE_ITEMS);

    const statesBeforeImmediateTransition = events
      .filter((event) => event.sequence < (immediateTransition?.sequence ?? 0))
      .filter((event) => event.eventType === 'state.entered')
      .map((event) => (event.payload as Record<string, unknown> | null)?.state);
    expect(statesBeforeImmediateTransition).not.toContain('NumberedOptionsHumanRequest');

    const firstFeedbackStart = feedbackStarts[0];
    expect(firstFeedbackStart.sequence).toBeGreaterThan(immediateTransition!.sequence);

    const preFeedbackHumanStarts = events.filter(
      (event) =>
        event.sequence < firstFeedbackStart.sequence &&
        event.eventType === 'child.started' &&
        event.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(preFeedbackHumanStarts).toHaveLength(0);

    const preFeedbackStates = events
      .filter((event) => event.sequence < firstFeedbackStart.sequence)
      .filter((event) => event.eventType === 'state.entered')
      .map((event) => (event.payload as Record<string, unknown> | null)?.state);
    expect(preFeedbackStates.filter((state) => state === 'IntegrateIntoSpec')).toHaveLength(2);
    expect(
      preFeedbackStates.filter(
        (state) => state === 'LogicalConsistencyCheckCreateFollowUpQuestions',
      ),
    ).toHaveLength(2);

    const sequences = events.map((event) => event.sequence);
    for (let index = 1; index < sequences.length; index += 1) {
      expect(sequences[index]).toBeGreaterThan(sequences[index - 1]);
    }
  }, 120_000);
});
