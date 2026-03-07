/**
 * GS-SD-003: Research-first custom prompt classification round trip.
 *
 * Requirement: SD-E2E-003-CustomPromptRoundTrip
 * Behaviors: GS-SD-003
 *
 * #### Flow
 * start → IntegrateIntoSpec(1) → LogicalConsistencyCheck(1) (3 questions) →
 * NumberedOptionsHumanRequest (Q1 w/ custom text) → ClassifyCustomPrompt (custom-answer) →
 * NumberedOptionsHumanRequest (Q2 w/ custom text) → ClassifyCustomPrompt (question-intent) →
 * ExpandQuestionWithClarification (research-only resolution) →
 * NumberedOptionsHumanRequest (revisit Q2) → NumberedOptionsHumanRequest (Q3) →
 * IntegrateIntoSpec(2) → LogicalConsistencyCheck(2) (empty) →
 * NumberedOptionsHumanRequest (completion) → Done
 *
 * #### Assertions
 * - Both classification intents exercised (custom-answer and question-intent).
 * - Custom answer buffered and carried to IntegrateIntoSpec.
 * - Research-only clarification emits observability and does not insert a follow-up.
 * - Deferred source question is revisited before older queued items.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  fixtureDir,
  findNthFeedbackChildRunId,
  getFeedbackStatus,
  listAllEvents,
  skipUnlessCopilotFixture,
  startSpecDocWorkflow,
  submitFeedbackResponse,
  waitForTerminal,
  type SpecDocInput,
} from './helpers.js';

const SCENARIO = 'gs-sd-003';
const shouldSkip = await skipUnlessCopilotFixture();

describe.skipIf(shouldSkip)('e2e.blackbox.spec-doc.GS-SD-003', () => {
  it('exercises research-first clarification flow with deferred-question revisit', async () => {
    const input: SpecDocInput = {
      request: 'Create a specification for a real-time analytics dashboard.',
      targetPath: 'docs/generated-spec.md',
      constraints: ['Sub-second latency', 'Support for 10k concurrent users'],
      copilotPromptOptions: { cwd: fixtureDir(SCENARIO) },
    };

    const started = await startSpecDocWorkflow(input, `${SCENARIO}-${randomUUID()}`);
    if (!started) return;

    const { runId } = started;

    const feedback0 = await findNthFeedbackChildRunId(runId, 0);
    const status0 = await getFeedbackStatus(feedback0);
    expect(status0.questionId).toBe('q-sd-003-a');
    await submitFeedbackResponse(
      feedback0,
      status0.questionId,
      [1],
      'Use PostgreSQL with connection pooling',
    );

    const feedback1 = await findNthFeedbackChildRunId(runId, 1);
    const status1 = await getFeedbackStatus(feedback1);
    expect(status1.questionId).toBe('q-sd-003-b');
    await submitFeedbackResponse(
      feedback1,
      status1.questionId,
      [1],
      'Need research on what similar systems usually choose here',
    );

    const feedback2 = await findNthFeedbackChildRunId(runId, 2);
    const status2 = await getFeedbackStatus(feedback2);
    expect(status2.questionId).toBe('q-sd-003-b');
    await submitFeedbackResponse(feedback2, status2.questionId, [1]);

    const feedback3 = await findNthFeedbackChildRunId(runId, 3);
    const status3 = await getFeedbackStatus(feedback3);
    expect(status3.questionId).toBe('q-sd-003-c');
    await submitFeedbackResponse(feedback3, status3.questionId, [1]);

    const feedback4 = await findNthFeedbackChildRunId(runId, 4);
    const status4 = await getFeedbackStatus(feedback4);
    expect(status4.questionId).toBe('completion-confirmation');
    await submitFeedbackResponse(feedback4, status4.questionId, [1]);

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

    const events = await listAllEvents(runId);
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('workflow.completed');

    const copilotStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'app-builder.copilot.prompt.v1',
    );
    expect(copilotStarts.length).toBeGreaterThanOrEqual(7);

    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1',
    );
    expect(feedbackStarts.length).toBe(5);

    const observabilityPayloads = events
      .filter((e) => e.eventType === 'log')
      .map((event) => {
        const metadata = event.payload?.metadata;
        if (!metadata || typeof metadata !== 'object') return undefined;
        const payload = (metadata as Record<string, unknown>).payload;
        return payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : undefined;
      })
      .filter((payload): payload is Record<string, unknown> => payload !== undefined);

    const researchLogged = observabilityPayloads.filter(
      (payload) => payload.observabilityType === 'spec-doc.research.logged',
    );
    expect(researchLogged).toHaveLength(1);
    expect(researchLogged[0].sourceQuestionId).toBe('q-sd-003-b');

    const clarificationGenerated = observabilityPayloads.filter(
      (payload) => payload.observabilityType === 'spec-doc.clarification.generated',
    );
    expect(clarificationGenerated).toHaveLength(0);

    const sequences = events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  }, 120_000);
});
