/**
 * Tests for spec-doc integration harness components.
 *
 * Validates: copilot double, feedback controller, queue inspector,
 * and observability capture sink.
 */

import { describe, expect, it } from 'vitest';

import type { QuestionQueueItem } from '../../../../src/workflows/spec-doc/contracts.js';
import type { PromptTemplateId } from '../../../../src/workflows/spec-doc/prompt-templates.js';
import { OBS_TYPES } from '../../../../src/workflows/spec-doc/observability.js';

import { createCopilotDouble } from './copilot-double.js';
import {
  createFeedbackController,
  createLatch,
  type FeedbackChildInput,
} from './feedback-controller.js';
import { createQueueInspector } from './queue-inspector.js';
import { createObservabilitySink, type ObservabilitySink } from './observability-sink.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeQueueItem(
  questionId: string,
  overrides?: Partial<QuestionQueueItem>,
): QuestionQueueItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve issue for ${questionId}`,
    options: [
      { id: 1, label: 'Option A', description: 'Desc A. Pros: Good. Cons: Bad.' },
      { id: 2, label: 'Option B', description: 'Desc B. Pros: Better. Cons: Worse.' },
    ],
    answered: false,
    ...overrides,
  };
}

function makeFeedbackInput(
  questionId: string,
  overrides?: Partial<FeedbackChildInput>,
): FeedbackChildInput {
  return {
    prompt: `Question for ${questionId}`,
    options: [
      { id: 1, label: 'Option A' },
      { id: 2, label: 'Option B' },
    ],
    questionId,
    requestedByRunId: 'run-001',
    requestedByWorkflowType: 'app-builder.spec-doc.v1',
    requestedByState: 'NumberedOptionsHumanRequest',
    ...overrides,
  };
}

// ===========================================================================
// CopilotDouble
// ===========================================================================

describe('CopilotDouble', () => {
  it('returns configured structuredOutput for a state', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [
        {
          structuredOutput: {
            specPath: 'specs/todo.md',
            changeSummary: ['Added scope'],
            resolvedQuestionIds: [],
            remainingQuestionIds: [],
          },
        },
      ],
    });

    const result = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'test prompt', outputSchema: '{"$id":"test-schema"}' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });

    expect(result.status).toBe('completed');
    expect(result.structuredOutput).toEqual({
      specPath: 'specs/todo.md',
      changeSummary: ['Added scope'],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    });
    expect(result.structuredOutputRaw).toBe(
      JSON.stringify({
        specPath: 'specs/todo.md',
        changeSummary: ['Added scope'],
        resolvedQuestionIds: [],
        remainingQuestionIds: [],
      }),
    );
  });

  it('records call metadata including templateId and outputSchemaId', async () => {
    const double = createCopilotDouble({
      LogicalConsistencyCheckCreateFollowUpQuestions: [{ structuredOutput: {} }],
    });

    await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: {
        prompt: 'check consistency',
        outputSchema:
          '{"$id":"https://composable-workflow.local/schemas/app-builder/spec-doc/consistency-check-output.schema.json"}',
      },
      correlationId: 'LogicalConsistencyCheckCreateFollowUpQuestions:spec-doc.consistency-check.v1',
    });

    expect(double.callCount).toBe(1);
    const call = double.calls[0];
    expect(call.state).toBe('LogicalConsistencyCheckCreateFollowUpQuestions');
    expect(call.templateId).toBe('spec-doc.consistency-check.v1');
    expect(call.outputSchemaId).toBe(
      'https://composable-workflow.local/schemas/app-builder/spec-doc/consistency-check-output.schema.json',
    );
    expect(call.prompt).toBe('check consistency');
  });

  it('consumes staged responses in FIFO order', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: { pass: 1 } }, { structuredOutput: { pass: 2 } }],
    });

    const r1 = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p1' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });
    const r2 = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p2' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });

    expect(r1.structuredOutput).toEqual({ pass: 1 });
    expect(r2.structuredOutput).toEqual({ pass: 2 });
  });

  it('throws when staged responses are exhausted', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: { ok: true } }],
    });

    await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p1' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });

    await expect(
      double.resolve({
        workflowType: 'app-builder.copilot.prompt.v1',
        input: { prompt: 'p2' },
        correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
      }),
    ).rejects.toThrow(/No staged response for state "IntegrateIntoSpec"/);
  });

  it('injects failure when configured', async () => {
    const double = createCopilotDouble({
      ClassifyCustomPrompt: [{ failure: new Error('copilot process crashed') }],
    });

    await expect(
      double.resolve({
        workflowType: 'app-builder.copilot.prompt.v1',
        input: { prompt: 'classify' },
        correlationId: 'ClassifyCustomPrompt:spec-doc.classify-custom-prompt.v1',
      }),
    ).rejects.toThrow('copilot process crashed');

    expect(double.callCount).toBe(1);
    expect(double.calls[0].state).toBe('ClassifyCustomPrompt');
  });

  it('supports schema-invalid responses (structuredOutput: null)', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: null, structuredOutputRaw: 'not valid json at all' }],
    });

    const result = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'integrate' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });

    expect(result.structuredOutput).toBeNull();
    expect(result.structuredOutputRaw).toBe('not valid json at all');
  });

  it('filters calls by state and templateId', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: { a: 1 } }],
      LogicalConsistencyCheckCreateFollowUpQuestions: [{ structuredOutput: { b: 2 } }],
    });

    await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p1' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });
    await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p2' },
      correlationId: 'LogicalConsistencyCheckCreateFollowUpQuestions:spec-doc.consistency-check.v1',
    });

    expect(double.callsByState('IntegrateIntoSpec')).toHaveLength(1);
    expect(double.callsByState('LogicalConsistencyCheckCreateFollowUpQuestions')).toHaveLength(1);
    expect(double.callsByTemplateId('spec-doc.integrate.v1' as PromptTemplateId)).toHaveLength(1);
    expect(
      double.callsByTemplateId('spec-doc.consistency-check.v1' as PromptTemplateId),
    ).toHaveLength(1);
  });

  it('reset clears call history and reloads responses', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: { v: 1 } }],
    });

    await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });
    expect(double.callCount).toBe(1);

    double.reset({ IntegrateIntoSpec: [{ structuredOutput: { v: 2 } }] });
    expect(double.callCount).toBe(0);

    const result = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p2' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });
    expect(result.structuredOutput).toEqual({ v: 2 });
  });

  it('addResponses appends to existing staged responses', async () => {
    const double = createCopilotDouble({
      IntegrateIntoSpec: [{ structuredOutput: { pass: 1 } }],
    });
    double.addResponses('IntegrateIntoSpec', [{ structuredOutput: { pass: 2 } }]);

    const r1 = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p1' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });
    const r2 = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p2' },
      correlationId: 'IntegrateIntoSpec:spec-doc.integrate.v1',
    });

    expect(r1.structuredOutput).toEqual({ pass: 1 });
    expect(r2.structuredOutput).toEqual({ pass: 2 });
  });

  it('throws for unknown state with no staged responses', async () => {
    const double = createCopilotDouble({});

    await expect(
      double.resolve({
        workflowType: 'app-builder.copilot.prompt.v1',
        input: { prompt: 'p' },
        correlationId: 'UnknownState:some-template',
      }),
    ).rejects.toThrow(/No staged response for state "UnknownState"/);
  });

  it('handles missing correlationId gracefully', async () => {
    const double = createCopilotDouble({
      unknown: [{ structuredOutput: { fallback: true } }],
    });

    const result = await double.resolve({
      workflowType: 'app-builder.copilot.prompt.v1',
      input: { prompt: 'p' },
    });

    expect(result.structuredOutput).toEqual({ fallback: true });
    expect(double.calls[0].state).toBe('unknown');
    expect(double.calls[0].templateId).toBe('unknown');
  });
});

// ===========================================================================
// FeedbackController
// ===========================================================================

describe('FeedbackController', () => {
  it('returns valid response with selectedOptionIds', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(result.status).toBe('responded');
    expect(result.response?.selectedOptionIds).toEqual([1]);
    expect(result.respondedAt).toBeDefined();
  });

  it('returns valid response with custom text', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [2], text: 'I need more detail on option 2' }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(result.status).toBe('responded');
    expect(result.response?.text).toBe('I need more detail on option 2');
    expect(result.response?.selectedOptionIds).toEqual([2]);
  });

  it('returns cancelled status when cancel is true', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ cancel: true }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(result.status).toBe('cancelled');
    expect(result.cancelledAt).toBeDefined();
    expect(result.response).toBeUndefined();
  });

  it('supports invalid selectedOptionIds for negative testing', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [999] }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(result.status).toBe('responded');
    expect(result.response?.selectedOptionIds).toEqual([999]);
  });

  it('supports empty selectedOptionIds for negative testing', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [] }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(result.response?.selectedOptionIds).toEqual([]);
  });

  it('consumes staged responses in FIFO order', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }, { selectedOptionIds: [2] }],
    });

    const r1 = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });
    const r2 = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(r1.response?.selectedOptionIds).toEqual([1]);
    expect(r2.response?.selectedOptionIds).toEqual([2]);
  });

  it('throws when staged responses are exhausted', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
    });

    await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    await expect(
      ctrl.resolve({
        workflowType: 'server.human-feedback.v1',
        input: makeFeedbackInput('q-1'),
      }),
    ).rejects.toThrow(/No staged response for questionId "q-1"/);
  });

  it('records call metadata', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
    });

    await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(ctrl.callCount).toBe(1);
    const call = ctrl.calls[0];
    expect(call.questionId).toBe('q-1');
    expect(call.requestedByRunId).toBe('run-001');
    expect(call.requestedByState).toBe('NumberedOptionsHumanRequest');
    expect(call.calledAt).toBeDefined();
  });

  it('filters calls by questionId', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
      'q-2': [{ selectedOptionIds: [2] }],
    });

    await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });
    await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-2'),
    });

    expect(ctrl.callsByQuestionId('q-1')).toHaveLength(1);
    expect(ctrl.callsByQuestionId('q-2')).toHaveLength(1);
  });

  it('reset clears history and reloads responses', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
    });

    await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    ctrl.reset({ 'q-2': [{ selectedOptionIds: [2] }] });

    expect(ctrl.callCount).toBe(0);
    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-2'),
    });
    expect(result.response?.selectedOptionIds).toEqual([2]);
  });

  it('addResponses appends to existing staged responses', async () => {
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1] }],
    });
    ctrl.addResponses('q-1', [{ selectedOptionIds: [2] }]);

    const r1 = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });
    const r2 = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('q-1'),
    });

    expect(r1.response?.selectedOptionIds).toEqual([1]);
    expect(r2.response?.selectedOptionIds).toEqual([2]);
  });

  it('supports multi-select for negative testing', async () => {
    const ctrl = createFeedbackController({
      'completion-confirmation': [{ selectedOptionIds: [1, 2] }],
    });

    const result = await ctrl.resolve({
      workflowType: 'server.human-feedback.v1',
      input: makeFeedbackInput('completion-confirmation'),
    });

    expect(result.response?.selectedOptionIds).toEqual([1, 2]);
  });
});

// ===========================================================================
// Latch
// ===========================================================================

describe('Latch', () => {
  it('blocks until released', async () => {
    const latch = createLatch();
    let resolved = false;

    const waiting = latch.promise.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    expect(latch.isReleased).toBe(false);

    latch.release();
    await waiting;

    expect(resolved).toBe(true);
    expect(latch.isReleased).toBe(true);
  });

  it('resolves immediately if already released', async () => {
    const latch = createLatch();
    latch.release();

    await latch.promise;
    expect(latch.isReleased).toBe(true);
  });

  it('release is idempotent', () => {
    const latch = createLatch();
    latch.release();
    latch.release();
    expect(latch.isReleased).toBe(true);
  });
});

describe('FeedbackController with barrier', () => {
  it('delays response until barrier resolves', async () => {
    const latch = createLatch();
    const ctrl = createFeedbackController({
      'q-1': [{ selectedOptionIds: [1], barrier: latch.promise }],
    });

    let resolved = false;
    const promise = ctrl
      .resolve({
        workflowType: 'server.human-feedback.v1',
        input: {
          prompt: 'q',
          options: [{ id: 1, label: 'A' }],
          questionId: 'q-1',
          requestedByRunId: 'run-001',
          requestedByWorkflowType: 'app-builder.spec-doc.v1',
        },
      })
      .then((r) => {
        resolved = true;
        return r;
      });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    latch.release();
    const result = await promise;

    expect(resolved).toBe(true);
    expect(result.status).toBe('responded');
  });
});

// ===========================================================================
// QueueInspector
// ===========================================================================

describe('QueueInspector', () => {
  describe('snapshot', () => {
    it('captures queue items with index and metadata', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('q-1'), makeQueueItem('q-2')];

      const snap = inspector.snapshot(queue, 'initial');

      expect(snap.size).toBe(2);
      expect(snap.label).toBe('initial');
      expect(snap.items).toHaveLength(2);
      expect(snap.items[0].questionId).toBe('q-1');
      expect(snap.items[0].index).toBe(0);
      expect(snap.items[1].questionId).toBe('q-2');
      expect(snap.items[1].index).toBe(1);
      expect(snap.takenAt).toBeDefined();
    });

    it('stores snapshots in order', () => {
      const inspector = createQueueInspector();
      inspector.snapshot([makeQueueItem('q-1')], 'first');
      inspector.snapshot([makeQueueItem('q-1'), makeQueueItem('q-2')], 'second');

      expect(inspector.snapshots).toHaveLength(2);
      expect(inspector.snapshots[0].label).toBe('first');
      expect(inspector.snapshots[1].label).toBe('second');
    });

    it('retrieves snapshot by label', () => {
      const inspector = createQueueInspector();
      inspector.snapshot([makeQueueItem('q-1')], 'target');

      const snap = inspector.snapshotByLabel('target');
      expect(snap).toBeDefined();
      expect(snap!.label).toBe('target');
    });

    it('returns undefined for unknown label', () => {
      const inspector = createQueueInspector();
      expect(inspector.snapshotByLabel('missing')).toBeUndefined();
    });

    it('snapshots are deep copies (no shared references)', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('q-1')];

      const snap = inspector.snapshot(queue, 'test');

      queue[0].prompt = 'MUTATED';
      queue[0].options[0].label = 'MUTATED';

      expect(snap.items[0].prompt).toBe('Resolve issue for q-1');
      expect(snap.items[0].options[0].label).toBe('Option A');
    });
  });

  describe('assertDeterministicOrder', () => {
    it('passes for correctly ordered queue', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('a-1'), makeQueueItem('b-2'), makeQueueItem('c-3')];

      expect(() => inspector.assertDeterministicOrder(queue)).not.toThrow();
    });

    it('passes for single-item queue', () => {
      const inspector = createQueueInspector();
      expect(() => inspector.assertDeterministicOrder([makeQueueItem('q-1')])).not.toThrow();
    });

    it('passes for empty queue', () => {
      const inspector = createQueueInspector();
      expect(() => inspector.assertDeterministicOrder([])).not.toThrow();
    });

    it('fails for out-of-order queue', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('c-3'), makeQueueItem('a-1')];

      expect(() => inspector.assertDeterministicOrder(queue)).toThrow(
        /not deterministically ordered/,
      );
    });
  });

  describe('assertInsertedAt', () => {
    it('validates correct insertion at specified index', () => {
      const inspector = createQueueInspector();
      const before = inspector.snapshot(
        [makeQueueItem('q-1'), makeQueueItem('q-2'), makeQueueItem('q-3')],
        'before',
      );
      const after = inspector.snapshot(
        [
          makeQueueItem('q-1'),
          makeQueueItem('q-1-followup'),
          makeQueueItem('q-2'),
          makeQueueItem('q-3'),
        ],
        'after',
      );

      expect(() =>
        inspector.assertInsertedAt(before, after, { questionId: 'q-1-followup' }, 1),
      ).not.toThrow();
    });

    it('fails when size did not increase by 1', () => {
      const inspector = createQueueInspector();
      const before = inspector.snapshot([makeQueueItem('q-1')], 'before');
      const after = inspector.snapshot(
        [makeQueueItem('q-1'), makeQueueItem('q-2'), makeQueueItem('q-3')],
        'after',
      );

      expect(() => inspector.assertInsertedAt(before, after, { questionId: 'q-2' }, 1)).toThrow(
        /Expected queue size to increase by 1/,
      );
    });

    it('fails when wrong item at expected index', () => {
      const inspector = createQueueInspector();
      const before = inspector.snapshot([makeQueueItem('q-1'), makeQueueItem('q-2')], 'before');
      const after = inspector.snapshot(
        [makeQueueItem('q-1'), makeQueueItem('q-surprise'), makeQueueItem('q-2')],
        'after',
      );

      expect(() =>
        inspector.assertInsertedAt(before, after, { questionId: 'q-expected' }, 1),
      ).toThrow(/Expected item "q-expected" at index 1/);
    });
  });

  describe('assertImmutability', () => {
    it('passes when items are unchanged', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('q-1'), makeQueueItem('q-2')];
      const before = inspector.snapshot(queue, 'before');
      const after = inspector.snapshot(
        [makeQueueItem('q-1'), makeQueueItem('q-1-followup'), makeQueueItem('q-2')],
        'after',
      );

      expect(() => inspector.assertImmutability(before, after)).not.toThrow();
    });

    it('fails when prompt is mutated', () => {
      const inspector = createQueueInspector();
      const before = inspector.snapshot([makeQueueItem('q-1')], 'before');
      const after = inspector.snapshot(
        [makeQueueItem('q-1', { prompt: 'MUTATED prompt' })],
        'after',
      );

      expect(() => inspector.assertImmutability(before, after)).toThrow(/Prompt mutated for "q-1"/);
    });

    it('fails when options are mutated', () => {
      const inspector = createQueueInspector();
      const before = inspector.snapshot([makeQueueItem('q-1')], 'before');
      const after = inspector.snapshot(
        [
          makeQueueItem('q-1', {
            options: [{ id: 1, label: 'Changed', description: 'New desc' }],
          }),
        ],
        'after',
      );

      expect(() => inspector.assertImmutability(before, after)).toThrow(
        /Options mutated for "q-1"/,
      );
    });
  });

  describe('assertItemAt', () => {
    it('validates item at index', () => {
      const inspector = createQueueInspector();
      const queue = [makeQueueItem('q-1'), makeQueueItem('q-2', { answered: true })];

      expect(() => inspector.assertItemAt(queue, 0, { questionId: 'q-1' })).not.toThrow();
      expect(() =>
        inspector.assertItemAt(queue, 1, { questionId: 'q-2', answered: true }),
      ).not.toThrow();
    });

    it('fails for wrong questionId', () => {
      const inspector = createQueueInspector();
      expect(() =>
        inspector.assertItemAt([makeQueueItem('q-1')], 0, { questionId: 'q-2' }),
      ).toThrow(/Expected questionId "q-2" at index 0/);
    });

    it('fails for out of bounds index', () => {
      const inspector = createQueueInspector();
      expect(() =>
        inspector.assertItemAt([makeQueueItem('q-1')], 5, { questionId: 'q-1' }),
      ).toThrow(/out of bounds/);
    });

    it('validates kind when specified', () => {
      const inspector = createQueueInspector();
      expect(() =>
        inspector.assertItemAt([makeQueueItem('q-1', { kind: 'completion-confirmation' })], 0, {
          questionId: 'q-1',
          kind: 'issue-resolution',
        }),
      ).toThrow(/Expected kind "issue-resolution"/);
    });
  });

  describe('assertContiguousOptionIds', () => {
    it('passes for contiguous IDs starting at 1', () => {
      const inspector = createQueueInspector();
      const item = makeQueueItem('q-1', {
        options: [
          { id: 1, label: 'A' },
          { id: 2, label: 'B' },
          { id: 3, label: 'C' },
        ],
      });

      expect(() => inspector.assertContiguousOptionIds(item)).not.toThrow();
    });

    it('fails for non-contiguous IDs', () => {
      const inspector = createQueueInspector();
      const item = makeQueueItem('q-1', {
        options: [
          { id: 1, label: 'A' },
          { id: 3, label: 'C' },
        ],
      });

      expect(() => inspector.assertContiguousOptionIds(item)).toThrow(
        /not contiguous starting at 1/,
      );
    });

    it('fails for IDs not starting at 1', () => {
      const inspector = createQueueInspector();
      const item = makeQueueItem('q-1', {
        options: [
          { id: 2, label: 'A' },
          { id: 3, label: 'B' },
        ],
      });

      expect(() => inspector.assertContiguousOptionIds(item)).toThrow(
        /not contiguous starting at 1/,
      );
    });

    it('fails for duplicate IDs', () => {
      const inspector = createQueueInspector();
      const item = makeQueueItem('q-1', {
        options: [
          { id: 1, label: 'A' },
          { id: 1, label: 'B' },
        ],
      });

      expect(() => inspector.assertContiguousOptionIds(item)).toThrow(/duplicates/);
    });
  });

  describe('reset', () => {
    it('clears all snapshots', () => {
      const inspector = createQueueInspector();
      inspector.snapshot([makeQueueItem('q-1')], 'snap-1');
      inspector.snapshot([makeQueueItem('q-2')], 'snap-2');

      inspector.reset();

      expect(inspector.snapshots).toHaveLength(0);
    });
  });
});

// ===========================================================================
// ObservabilitySink
// ===========================================================================

describe('ObservabilitySink', () => {
  describe('capture', () => {
    it('captures log entries with auto-incrementing sequence', () => {
      const sink = createObservabilitySink();

      sink.capture({ level: 'info', message: 'first' });
      sink.capture({ level: 'info', message: 'second' });

      expect(sink.logCount).toBe(2);
      expect(sink.logs[0].sequence).toBe(1);
      expect(sink.logs[1].sequence).toBe(2);
      expect(sink.logs[0].event.message).toBe('first');
    });

    it('extracts observability events from payloads', () => {
      const sink = createObservabilitySink();

      sink.capture({
        level: 'info',
        message: '[obs] Delegation started',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'test-schema',
        },
      });

      expect(sink.eventCount).toBe(1);
      expect(sink.events[0].observabilityType).toBe(OBS_TYPES.delegationStarted);
      expect(sink.events[0].state).toBe('IntegrateIntoSpec');
    });

    it('ignores logs without observability payload', () => {
      const sink = createObservabilitySink();

      sink.capture({ level: 'info', message: 'plain message' });
      sink.capture({ level: 'debug', message: 'with payload', payload: { foo: 'bar' } });

      expect(sink.logCount).toBe(2);
      expect(sink.eventCount).toBe(0);
    });
  });

  describe('query helpers', () => {
    function sinkWithEvents(): ObservabilitySink {
      const sink = createObservabilitySink();

      sink.capture({
        level: 'info',
        message: 'delegation',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });
      sink.capture({
        level: 'info',
        message: 'integration pass',
        payload: {
          observabilityType: OBS_TYPES.integrationPassCompleted,
          state: 'IntegrateIntoSpec',
          source: 'workflow-input',
          specPath: 'specs/test.md',
          passNumber: 1,
          changeSummaryCount: 2,
          resolvedCount: 0,
          remainingCount: 0,
          promptTemplateId: 'spec-doc.integrate.v1',
        },
      });
      sink.capture({
        level: 'info',
        message: 'question generated',
        payload: {
          observabilityType: OBS_TYPES.questionGenerated,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
          kind: 'issue-resolution',
          queuePosition: 0,
          queueSize: 2,
        },
      });
      sink.capture({
        level: 'info',
        message: 'response received',
        payload: {
          observabilityType: OBS_TYPES.responseReceived,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
          selectedOptionIds: [1],
          hasCustomText: false,
        },
      });

      return sink;
    }

    it('eventsByType filters correctly', () => {
      const sink = sinkWithEvents();
      expect(sink.eventsByType(OBS_TYPES.delegationStarted)).toHaveLength(1);
      expect(sink.eventsByType(OBS_TYPES.questionGenerated)).toHaveLength(1);
      expect(sink.eventsByType(OBS_TYPES.terminalCompleted)).toHaveLength(0);
    });

    it('eventsByState filters correctly', () => {
      const sink = sinkWithEvents();
      expect(sink.eventsByState('IntegrateIntoSpec')).toHaveLength(2);
      expect(sink.eventsByState('NumberedOptionsHumanRequest')).toHaveLength(2);
      expect(sink.eventsByState('Done')).toHaveLength(0);
    });

    it('eventsByQuestionId filters correctly', () => {
      const sink = sinkWithEvents();
      expect(sink.eventsByQuestionId('q-1')).toHaveLength(2);
      expect(sink.eventsByQuestionId('q-999')).toHaveLength(0);
    });

    it('typed event accessors return correct types', () => {
      const sink = sinkWithEvents();
      expect(sink.delegationEvents()).toHaveLength(1);
      expect(sink.delegationEvents()[0].payload.promptTemplateId).toBe('spec-doc.integrate.v1');
      expect(sink.integrationPassEvents()).toHaveLength(1);
      expect(sink.integrationPassEvents()[0].payload.passNumber).toBe(1);
      expect(sink.questionGeneratedEvents()).toHaveLength(1);
      expect(sink.responseReceivedEvents()).toHaveLength(1);
    });
  });

  describe('assertion helpers', () => {
    it('assertAllDelegationsHaveTemplateId passes when all have it', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() => sink.assertAllDelegationsHaveTemplateId()).not.toThrow();
    });

    it('assertAllDelegationsHaveTemplateId fails for empty templateId', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: '',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() => sink.assertAllDelegationsHaveTemplateId()).toThrow(
        /1 delegation event\(s\) missing promptTemplateId/,
      );
    });

    it('assertTemplateIdUsed passes when template was used', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() =>
        sink.assertTemplateIdUsed('spec-doc.integrate.v1' as PromptTemplateId),
      ).not.toThrow();
    });

    it('assertTemplateIdUsed fails when template was not used', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() =>
        sink.assertTemplateIdUsed('spec-doc.consistency-check.v1' as PromptTemplateId),
      ).toThrow(/Template ID "spec-doc.consistency-check.v1" not found/);
    });

    it('assertEventSequence passes for matching sequence', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });
      sink.capture({
        level: 'info',
        message: 'i1',
        payload: {
          observabilityType: OBS_TYPES.integrationPassCompleted,
          state: 'IntegrateIntoSpec',
          source: 'workflow-input',
          specPath: 'specs/test.md',
          passNumber: 1,
          changeSummaryCount: 0,
          resolvedCount: 0,
          remainingCount: 0,
          promptTemplateId: 'spec-doc.integrate.v1',
        },
      });

      expect(() =>
        sink.assertEventSequence([OBS_TYPES.delegationStarted, OBS_TYPES.integrationPassCompleted]),
      ).not.toThrow();
    });

    it('assertEventSequence fails for mismatched sequence', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() => sink.assertEventSequence([OBS_TYPES.integrationPassCompleted])).toThrow(
        /Event sequence mismatch at position 0/,
      );
    });

    it('assertEventSequence fails for wrong length', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      expect(() =>
        sink.assertEventSequence([OBS_TYPES.delegationStarted, OBS_TYPES.integrationPassCompleted]),
      ).toThrow(/Event sequence length mismatch/);
    });

    it('assertPayloadField finds matching field value', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'q1',
        payload: {
          observabilityType: OBS_TYPES.questionGenerated,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
          kind: 'issue-resolution',
          queuePosition: 0,
          queueSize: 3,
        },
      });

      expect(() =>
        sink.assertPayloadField(OBS_TYPES.questionGenerated, 'questionId', 'q-1'),
      ).not.toThrow();
    });

    it('assertPayloadField fails when field value not found', () => {
      const sink = createObservabilitySink();
      sink.capture({
        level: 'info',
        message: 'q1',
        payload: {
          observabilityType: OBS_TYPES.questionGenerated,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
          kind: 'issue-resolution',
          queuePosition: 0,
          queueSize: 3,
        },
      });

      expect(() =>
        sink.assertPayloadField(OBS_TYPES.questionGenerated, 'questionId', 'q-999'),
      ).toThrow(/No event of type .* has questionId="q-999"/);
    });
  });

  describe('reset', () => {
    it('clears all captured data and resets sequence', () => {
      const sink = createObservabilitySink();

      sink.capture({
        level: 'info',
        message: 'd1',
        payload: {
          observabilityType: OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: 'spec-doc.integrate.v1',
          outputSchemaId: 'schema-a',
        },
      });

      sink.reset();

      expect(sink.logCount).toBe(0);
      expect(sink.eventCount).toBe(0);

      sink.capture({ level: 'info', message: 'after reset' });
      expect(sink.logs[0].sequence).toBe(1);
    });
  });

  describe('clarification event query', () => {
    it('eventsByQuestionId matches sourceQuestionId and followUpQuestionId', () => {
      const sink = createObservabilitySink();

      sink.capture({
        level: 'info',
        message: 'clar',
        payload: {
          observabilityType: OBS_TYPES.clarificationGenerated,
          state: 'ExpandQuestionWithClarification',
          sourceQuestionId: 'q-1',
          followUpQuestionId: 'q-1-follow',
          insertIndex: 1,
          promptTemplateId: 'spec-doc.expand-clarification.v1',
        },
      });

      expect(sink.eventsByQuestionId('q-1')).toHaveLength(1);
      expect(sink.eventsByQuestionId('q-1-follow')).toHaveLength(1);
      expect(sink.eventsByQuestionId('q-2')).toHaveLength(0);
    });
  });
});
