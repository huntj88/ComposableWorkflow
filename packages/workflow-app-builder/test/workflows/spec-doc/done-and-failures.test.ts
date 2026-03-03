/**
 * Tests for Done terminal state and child failure
 * propagation in `app-builder.spec-doc.v1`.
 *
 * Covers:
 * - SD-TERM-001: Done reachable only from NumberedOptionsHumanRequest
 * - SD-TERM-002: Completion-confirmation cardinality (exactly one selected option)
 * - SD-TERM-003: Terminal output conforms to spec-doc-generation-output.schema.json
 * - SD-TERM-005: Copilot child failure with originating FSM state context
 *
 * Behaviors: B-SD-TRANS-007, B-SD-DONE-001, B-SD-DONE-002, B-SD-DONE-003,
 *   B-SD-FAIL-001, B-SD-COPILOT-002.
 */

import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  NormalizedAnswer,
  NumberedQuestionOption,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import { handleDone, DONE_STATE } from '../../../src/workflows/spec-doc/states/done.js';
import {
  buildChildFailurePayload,
  createChildFailureError,
  type SpecDocFailurePayload,
} from '../../../src/workflows/spec-doc/failure.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../../../src/workflows/spec-doc/queue.js';
import {
  type SpecDocStateData,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';
import {
  specDocTransitions,
  isAllowedTransition,
} from '../../../src/workflows/spec-doc/workflow.js';
import { createSpecDocValidator } from '../../../src/workflows/spec-doc/schema-validation.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function makeOption(id: number, label: string): NumberedQuestionOption {
  return {
    id,
    label,
    description: `${label}. Pros: Benefit of choosing this. Cons: Drawback of choosing this.`,
  };
}

function makeCompletionItem(answered = true): QuestionQueueItem {
  return {
    questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
    kind: 'completion-confirmation',
    prompt: 'Is the specification document complete?',
    options: [makeOption(1, 'Yes, the spec is done'), makeOption(2, 'No, continue refining')],
    answered,
  };
}

function makeCompletionAnswer(selectedOptionIds: number[] = [1]): NormalizedAnswer {
  return {
    questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
    selectedOptionIds,
    answeredAt: '2026-03-03T12:00:00Z',
  };
}

function makeValidDoneStateData(overrides?: Partial<SpecDocStateData>): SpecDocStateData {
  return {
    ...createInitialStateData(),
    queue: [makeCompletionItem(true)],
    queueIndex: 1,
    normalizedAnswers: [makeCompletionAnswer()],
    counters: {
      integrationPasses: 1,
      consistencyCheckPasses: 1,
    },
    artifacts: {
      specPath: '/workspace/specs/todo.md',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock context
// ---------------------------------------------------------------------------

function createMockContext(inputOverrides?: Partial<SpecDocGenerationInput>) {
  const transitionSpy = vi.fn();
  const failSpy = vi.fn();
  const logSpy = vi.fn();
  const completeSpy = vi.fn();

  const defaultInput: SpecDocGenerationInput = {
    request: 'Build a TODO app',
    targetPath: 'specs/todo.md',
    constraints: ['Must use React'],
    ...inputOverrides,
  };

  const ctx = {
    runId: 'run-done-001',
    workflowType: 'app-builder.spec-doc.v1',
    input: defaultInput,
    now: () => new Date('2026-03-03T12:00:00Z'),
    log: logSpy,
    transition: transitionSpy,
    launchChild: vi.fn(),
    runCommand: vi.fn(),
    complete: completeSpy,
    fail: failSpy,
  } as unknown as WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>;

  return { ctx, transitionSpy, failSpy, logSpy, completeSpy };
}

// ===========================================================================
// SD-TERM-001 – Done reachable only from NumberedOptionsHumanRequest
// ===========================================================================

describe('SD-TERM-001 – Done reachable only from NumberedOptionsHumanRequest', () => {
  it('only NumberedOptionsHumanRequest has an edge to Done in the transition map', () => {
    const sourcesToDone = specDocTransitions.filter((t) => t.to === 'Done').map((t) => t.from);
    expect(sourcesToDone).toEqual(['NumberedOptionsHumanRequest']);
  });

  it('IntegrateIntoSpec cannot transition to Done', () => {
    expect(isAllowedTransition('IntegrateIntoSpec', 'Done')).toBe(false);
  });

  it('LogicalConsistencyCheckCreateFollowUpQuestions cannot transition to Done', () => {
    expect(isAllowedTransition('LogicalConsistencyCheckCreateFollowUpQuestions', 'Done')).toBe(
      false,
    );
  });

  it('ClassifyCustomPrompt cannot transition to Done', () => {
    expect(isAllowedTransition('ClassifyCustomPrompt', 'Done')).toBe(false);
  });

  it('ExpandQuestionWithClarification cannot transition to Done', () => {
    expect(isAllowedTransition('ExpandQuestionWithClarification', 'Done')).toBe(false);
  });
});

// ===========================================================================
// SD-TERM-002 – Completion-confirmation cardinality
// ===========================================================================

describe('SD-TERM-002 – Completion-confirmation cardinality', () => {
  it('fails when no completion-confirmation answer exists', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      normalizedAnswers: [], // No answers at all
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('Missing completion-confirmation answer');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('fails when completion-confirmation answer has zero selected options', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      normalizedAnswers: [makeCompletionAnswer([])],
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('exactly one selectedOptionId');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('fails when completion-confirmation answer has multiple selected options', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      normalizedAnswers: [makeCompletionAnswer([1, 2])],
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('exactly one selectedOptionId');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('succeeds when completion-confirmation answer has exactly one selected option', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData();

    handleDone(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// SD-TERM-003 – Terminal output contract
// ===========================================================================

describe('SD-TERM-003 – Terminal output contract', () => {
  it('emits output with status "completed"', () => {
    const { ctx, completeSpy } = createMockContext();
    handleDone(ctx, makeValidDoneStateData());

    const output: SpecDocGenerationOutput = completeSpy.mock.calls[0][0];
    expect(output.status).toBe('completed');
  });

  it('emits output with specPath ending in .md', () => {
    const { ctx, completeSpy } = createMockContext();
    handleDone(ctx, makeValidDoneStateData());

    const output: SpecDocGenerationOutput = completeSpy.mock.calls[0][0];
    expect(output.specPath).toMatch(/\.md$/);
    expect(output.specPath).toBe('/workspace/specs/todo.md');
  });

  it('emits output with summary.unresolvedQuestions === 0', () => {
    const { ctx, completeSpy } = createMockContext();
    handleDone(ctx, makeValidDoneStateData());

    const output: SpecDocGenerationOutput = completeSpy.mock.calls[0][0];
    expect(output.summary.unresolvedQuestions).toBe(0);
  });

  it('emits output with accurate integrationPasses and consistencyCheckPasses', () => {
    const { ctx, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      counters: {
        integrationPasses: 3,
        consistencyCheckPasses: 2,
      },
    });

    handleDone(ctx, stateData);

    const output: SpecDocGenerationOutput = completeSpy.mock.calls[0][0];
    expect(output.artifacts.integrationPasses).toBe(3);
    expect(output.artifacts.consistencyCheckPasses).toBe(2);
  });

  it('terminal output validates against spec-doc-generation-output.schema.json', () => {
    const { ctx, completeSpy } = createMockContext();
    handleDone(ctx, makeValidDoneStateData());

    const output: SpecDocGenerationOutput = completeSpy.mock.calls[0][0];

    // Cross-validate with the schema validator
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(true);
  });

  it('fails when specPath is not set in artifacts', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      artifacts: {},
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('specPath is not set');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('fails when specPath does not end in .md', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      artifacts: { specPath: '/workspace/specs/todo.txt' },
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('does not end with ".md"');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('fails when integrationPasses is 0', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      counters: {
        integrationPasses: 0,
        consistencyCheckPasses: 1,
      },
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('integrationPasses is 0');
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('fails when consistencyCheckPasses is 0', () => {
    const { ctx, failSpy, completeSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      counters: {
        integrationPasses: 1,
        consistencyCheckPasses: 0,
      },
    });

    handleDone(ctx, stateData);

    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('consistencyCheckPasses is 0');
    expect(completeSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Done state handler – edge cases
// ===========================================================================

describe('Done state handler – edge cases', () => {
  it('handles missing state data by using initial defaults (which will fail)', () => {
    const { ctx, failSpy } = createMockContext();

    handleDone(ctx, undefined);

    // Initial state data has no completion answer → should fail
    expect(failSpy).toHaveBeenCalledOnce();
    expect(failSpy.mock.calls[0][0].message).toContain('Missing completion-confirmation answer');
  });

  it('finds completion answer among multiple answers', () => {
    const { ctx, completeSpy, failSpy } = createMockContext();
    const stateData = makeValidDoneStateData({
      normalizedAnswers: [
        {
          questionId: 'q-1',
          selectedOptionIds: [2],
          answeredAt: '2026-03-03T11:59:00Z',
        },
        {
          questionId: 'q-2',
          selectedOptionIds: [1],
          answeredAt: '2026-03-03T11:59:30Z',
        },
        makeCompletionAnswer(),
      ],
    });

    handleDone(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalledOnce();
  });

  it('logs workflow completion on success', () => {
    const { ctx, logSpy } = createMockContext();
    handleDone(ctx, makeValidDoneStateData());

    const logCalls = logSpy.mock.calls.map(
      (c: [{ level: string; message: string }]) => c[0].message,
    );
    expect(logCalls.some((m: string) => m.includes('[obs] Terminal completed:'))).toBe(true);
  });

  it('DONE_STATE constant is "Done"', () => {
    expect(DONE_STATE).toBe('Done');
  });
});

// ===========================================================================
// SD-TERM-005 – Copilot child failure with stage context
// ===========================================================================

describe('SD-TERM-005 – Copilot child failure with stage context', () => {
  describe('buildChildFailurePayload', () => {
    it('includes originating FSM state', () => {
      const originalError = new Error('Copilot timeout');
      const payload = buildChildFailurePayload('IntegrateIntoSpec', originalError);

      expect(payload.state).toBe('IntegrateIntoSpec');
    });

    it('includes original error message in reason', () => {
      const originalError = new Error('Schema validation failed');
      const payload = buildChildFailurePayload(
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        originalError,
      );

      expect(payload.reason).toContain('Schema validation failed');
      expect(payload.reason).toContain('LogicalConsistencyCheckCreateFollowUpQuestions');
    });

    it('has empty unresolvedQuestions for child failures', () => {
      const payload = buildChildFailurePayload('IntegrateIntoSpec', new Error('timeout'));

      expect(payload.unresolvedQuestions).toEqual([]);
    });
  });

  describe('createChildFailureError', () => {
    it('returns an Error instance', () => {
      const err = createChildFailureError('IntegrateIntoSpec', new Error('child failed'));

      expect(err).toBeInstanceOf(Error);
    });

    it('includes FSM state in error message', () => {
      const err = createChildFailureError('ClassifyCustomPrompt', new Error('child failed'));

      expect(err.message).toContain('[ClassifyCustomPrompt]');
      expect(err.message).toContain('ClassifyCustomPrompt');
    });

    it('preserves original error as cause', () => {
      const original = new Error('original cause');
      const err = createChildFailureError('IntegrateIntoSpec', original);

      expect(err.cause).toBe(original);
    });

    it('embeds structured payload as JSON in error message', () => {
      const err = createChildFailureError(
        'ExpandQuestionWithClarification',
        new Error('copilot unreachable'),
      );

      const detailsMatch = err.message.match(/Details: (.+)$/);
      expect(detailsMatch).not.toBeNull();

      const payload: SpecDocFailurePayload = JSON.parse(detailsMatch![1]);
      expect(payload.state).toBe('ExpandQuestionWithClarification');
      expect(payload.reason).toContain('copilot unreachable');
      expect(payload.unresolvedQuestions).toEqual([]);
    });

    it('works with each canonical FSM state that delegates to copilot', () => {
      const copilotStates = [
        'IntegrateIntoSpec',
        'LogicalConsistencyCheckCreateFollowUpQuestions',
        'ClassifyCustomPrompt',
        'ExpandQuestionWithClarification',
      ];

      for (const state of copilotStates) {
        const err = createChildFailureError(state, new Error('fail'));
        expect(err.message).toContain(`[${state}]`);
        expect(err.message).toContain(state);
      }
    });
  });
});

// ===========================================================================
// Failure payload contract shape
// ===========================================================================

describe('Failure payload shape contract', () => {
  it('child-failure payload includes { state, reason, unresolvedQuestions[] }', () => {
    const payload = buildChildFailurePayload('IntegrateIntoSpec', new Error('fail'));

    expect(payload).toHaveProperty('state');
    expect(payload).toHaveProperty('reason');
    expect(payload).toHaveProperty('unresolvedQuestions');
    expect(Array.isArray(payload.unresolvedQuestions)).toBe(true);
  });
});

// ===========================================================================
// B-SD-DONE-003 – Schema validation of terminal output
// ===========================================================================

describe('B-SD-DONE-003 – output schema validation', () => {
  it('valid terminal output passes schema validation', () => {
    const output: SpecDocGenerationOutput = {
      status: 'completed',
      specPath: '/workspace/specs/todo.md',
      summary: {
        unresolvedQuestions: 0,
      },
      artifacts: {
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
    };

    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(true);
  });

  it('rejects output with non-zero unresolvedQuestions', () => {
    const output = {
      status: 'completed',
      specPath: '/workspace/specs/todo.md',
      summary: {
        unresolvedQuestions: 1, // invalid: must be 0
      },
      artifacts: {
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
    };

    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
  });

  it('rejects output with specPath not ending in .md', () => {
    const output = {
      status: 'completed',
      specPath: '/workspace/specs/todo.txt',
      summary: {
        unresolvedQuestions: 0,
      },
      artifacts: {
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
    };

    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
  });

  it('rejects output with integrationPasses < 1', () => {
    const output = {
      status: 'completed',
      specPath: '/workspace/specs/todo.md',
      summary: {
        unresolvedQuestions: 0,
      },
      artifacts: {
        integrationPasses: 0,
        consistencyCheckPasses: 1,
      },
    };

    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
  });

  it('rejects output with missing status field', () => {
    const output = {
      specPath: '/workspace/specs/todo.md',
      summary: {
        unresolvedQuestions: 0,
      },
      artifacts: {
        integrationPasses: 1,
        consistencyCheckPasses: 1,
      },
    };

    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
  });
});
