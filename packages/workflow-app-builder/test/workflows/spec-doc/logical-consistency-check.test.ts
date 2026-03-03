import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  BlockingIssue,
  ConsistencyCheckOutput,
  NumberedQuestionItem,
  NumberedQuestionOption,
  ReadinessChecklist,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import type { CopilotAppBuilderOutput } from '../../../src/workflows/copilot-prompt.js';
import {
  handleLogicalConsistencyCheck,
  LOGICAL_CONSISTENCY_CHECK_STATE,
} from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import {
  buildQuestionQueue,
  sortByQuestionId,
  synthesizeCompletionConfirmation,
  COMPLETION_CONFIRMATION_QUESTION_ID,
} from '../../../src/workflows/spec-doc/queue.js';
import {
  type SpecDocStateData,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function validReadinessChecklist(overrides?: Partial<ReadinessChecklist>): ReadinessChecklist {
  return {
    hasScopeAndObjective: true,
    hasNonGoals: true,
    hasConstraintsAndAssumptions: true,
    hasInterfacesOrContracts: true,
    hasTestableAcceptanceCriteria: true,
    ...overrides,
  };
}

function makeOption(id: number, label: string): NumberedQuestionOption {
  return {
    id,
    label,
    description: `${label}. Pros: Benefit of choosing this. Cons: Drawback of choosing this.`,
  };
}

function makeBlockingIssue(overrides?: Partial<BlockingIssue>): BlockingIssue {
  return {
    id: 'issue-1',
    description: 'Missing error handling strategy',
    severity: 'high',
    ...overrides,
  };
}

function makeFollowUpQuestion(
  questionId: string,
  overrides?: Partial<NumberedQuestionItem>,
): NumberedQuestionItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve issue for ${questionId}`,
    options: [makeOption(1, 'Option A'), makeOption(2, 'Option B')],
    ...overrides,
  };
}

function validConsistencyOutput(
  overrides?: Partial<ConsistencyCheckOutput>,
): ConsistencyCheckOutput {
  return {
    blockingIssues: [makeBlockingIssue()],
    followUpQuestions: [makeFollowUpQuestion('q-cc-1')],
    readinessChecklist: validReadinessChecklist(),
    ...overrides,
  };
}

function emptyConsistencyOutput(): ConsistencyCheckOutput {
  return {
    blockingIssues: [],
    followUpQuestions: [],
    readinessChecklist: validReadinessChecklist(),
  };
}

interface MockCtxOptions {
  input?: Partial<SpecDocGenerationInput>;
  childOutput?: Partial<CopilotAppBuilderOutput>;
  childThrows?: Error;
  stateData?: SpecDocStateData;
}

function createMockContext(opts: MockCtxOptions = {}) {
  const output = opts.childOutput?.structuredOutput ?? validConsistencyOutput();

  const defaultChildOutput: CopilotAppBuilderOutput = {
    status: 'completed',
    prompt: 'test prompt',
    exitCode: 0,
    stdout: '',
    stderr: '',
    sessionId: 'session-1',
    structuredOutputRaw: JSON.stringify(output),
    structuredOutput: output,
    ...opts.childOutput,
  };

  const launchChildSpy = opts.childThrows
    ? vi.fn().mockRejectedValue(opts.childThrows)
    : vi.fn().mockResolvedValue(defaultChildOutput);
  const transitionSpy = vi.fn();
  const failSpy = vi.fn();
  const logSpy = vi.fn();

  const defaultInput: SpecDocGenerationInput = {
    request: 'Build a TODO app',
    targetPath: 'specs/todo.md',
    constraints: ['Must use React', 'Must support offline'],
    ...opts.input,
  };

  const ctx = {
    runId: 'run-001',
    workflowType: 'app-builder.spec-doc.v1',
    input: defaultInput,
    now: () => new Date('2026-03-02T12:00:00Z'),
    log: logSpy,
    transition: transitionSpy,
    launchChild: launchChildSpy,
    runCommand: vi.fn(),
    complete: vi.fn(),
    fail: failSpy,
  } as unknown as WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>;

  return { ctx, launchChildSpy, transitionSpy, failSpy, logSpy };
}

function stateDataWithIntegrationOutput(
  remainingQuestionIds: string[] = ['q-open-1'],
  specPath = 'specs/todo.md',
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    artifacts: {
      specPath,
      lastIntegrationOutput: {
        specPath,
        changeSummary: ['Added scope'],
        resolvedQuestionIds: [],
        remainingQuestionIds,
      },
    },
  };
}

// ===========================================================================
// Queue Module Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// SD-CHECK-002 – Deterministic Queue Ordering
// ---------------------------------------------------------------------------

describe('SD-CHECK-002-DeterministicQueueOrder', () => {
  it('sorts follow-up questions deterministically by questionId', () => {
    const questions: NumberedQuestionItem[] = [
      makeFollowUpQuestion('q-cc-3'),
      makeFollowUpQuestion('q-cc-1'),
      makeFollowUpQuestion('q-cc-2'),
    ];

    const sorted = sortByQuestionId(questions);

    expect(sorted.map((q) => q.questionId)).toEqual(['q-cc-1', 'q-cc-2', 'q-cc-3']);
  });

  it('sort is stable across multiple invocations', () => {
    const questions: NumberedQuestionItem[] = [
      makeFollowUpQuestion('q-z'),
      makeFollowUpQuestion('q-a'),
      makeFollowUpQuestion('q-m'),
    ];

    const firstRun = sortByQuestionId(questions);
    const secondRun = sortByQuestionId(questions);
    const thirdRun = sortByQuestionId([...questions].reverse());

    expect(firstRun.map((q) => q.questionId)).toEqual(secondRun.map((q) => q.questionId));
    expect(firstRun.map((q) => q.questionId)).toEqual(thirdRun.map((q) => q.questionId));
  });

  it('does not mutate the original array', () => {
    const questions: NumberedQuestionItem[] = [
      makeFollowUpQuestion('q-b'),
      makeFollowUpQuestion('q-a'),
    ];
    const original = [...questions];

    sortByQuestionId(questions);

    expect(questions.map((q) => q.questionId)).toEqual(original.map((q) => q.questionId));
  });

  it('buildQuestionQueue produces deterministically ordered queue items', () => {
    const questions: NumberedQuestionItem[] = [
      makeFollowUpQuestion('q-cc-3'),
      makeFollowUpQuestion('q-cc-1'),
      makeFollowUpQuestion('q-cc-2'),
    ];

    const queue = buildQuestionQueue(questions);

    expect(queue.map((q) => q.questionId)).toEqual(['q-cc-1', 'q-cc-2', 'q-cc-3']);
    expect(queue.every((q) => q.answered === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SD-CHECK-003 – Completion-Confirmation Synthesis
// ---------------------------------------------------------------------------

describe('SD-CHECK-003-CompletionSynthesis', () => {
  it('synthesizes exactly one completion-confirmation question when follow-up list is empty', () => {
    const queue = buildQuestionQueue([]);

    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe('completion-confirmation');
    expect(queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
  });

  it('completion-confirmation has an explicit "spec is done" option', () => {
    const confirmation = synthesizeCompletionConfirmation();

    expect(confirmation.options.length).toBeGreaterThanOrEqual(2);
    const doneOption = confirmation.options.find(
      (o) => o.label.toLowerCase().includes('done') || o.label.toLowerCase().includes('yes'),
    );
    expect(doneOption).toBeDefined();
  });

  it('completion-confirmation options have contiguous integer IDs starting at 1', () => {
    const confirmation = synthesizeCompletionConfirmation();

    const ids = confirmation.options.map((o) => o.id);
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(i + 1);
    }
  });

  it('completion-confirmation is workflow-authored, not model-authored', () => {
    // The function is deterministic and parameterless — no model input.
    const a = synthesizeCompletionConfirmation();
    const b = synthesizeCompletionConfirmation();
    expect(a).toEqual(b);
  });

  it('does not synthesize completion when follow-up questions exist', () => {
    const questions = [makeFollowUpQuestion('q-cc-1')];
    const queue = buildQuestionQueue(questions);

    expect(queue.every((q) => q.kind === 'issue-resolution')).toBe(true);
  });

  it('completion-confirmation option descriptions include Pros: and Cons:', () => {
    const confirmation = synthesizeCompletionConfirmation();
    for (const option of confirmation.options) {
      expect(option.description).toBeDefined();
      expect(option.description).toContain('Pros:');
      expect(option.description).toContain('Cons:');
    }
  });
});

// ===========================================================================
// State Handler Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// SD-CHECK-001 – Fixed Route to NumberedOptionsHumanRequest
// ---------------------------------------------------------------------------

describe('SD-CHECK-001-FixedRouteToHumanRequest', () => {
  it('always transitions to NumberedOptionsHumanRequest with follow-up questions', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, transitionSpy, failSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });

  it('always transitions to NumberedOptionsHumanRequest with empty follow-up (completion)', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = emptyConsistencyOutput();
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });

  it('direct transition to Done is impossible from this state', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = emptyConsistencyOutput();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    // Transition target is never 'Done'
    for (const call of transitionSpy.mock.calls) {
      expect(call[0]).not.toBe('Done');
    }
    expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
  });
});

// ---------------------------------------------------------------------------
// SD-CHECK-004 – Question Item Schema Validation
// ---------------------------------------------------------------------------

describe('SD-CHECK-004-QuestionItemSchema', () => {
  it('valid consistency-check output passes schema validation', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('invalid output (missing required fields) triggers terminal failure', async () => {
    const invalid = { blockingIssues: [] }; // missing followUpQuestions, readinessChecklist
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalid,
        structuredOutputRaw: JSON.stringify(invalid),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain(LOGICAL_CONSISTENCY_CHECK_STATE);
    expect(error.message).toContain('schema validation failed');
  });

  it('output with invalid readinessChecklist triggers schema failure', async () => {
    const invalid = {
      blockingIssues: [],
      followUpQuestions: [],
      readinessChecklist: { hasScopeAndObjective: 'not-a-boolean' },
    };
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalid,
        structuredOutputRaw: JSON.stringify(invalid),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SD-CHECK-005 – Consistency Pass Counter
// ---------------------------------------------------------------------------

describe('SD-CHECK-005-ConsistencyPassCounter', () => {
  it('increments consistencyCheckPasses on successful pass', async () => {
    const stateData = stateDataWithIntegrationOutput();
    expect(stateData.counters.consistencyCheckPasses).toBe(0);
    const { ctx, transitionSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const updatedData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedData.counters.consistencyCheckPasses).toBe(1);
  });

  it('does not increment on schema validation failure', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: {},
        structuredOutputRaw: '{}',
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
  });

  it('accumulates across multiple passes', async () => {
    const stateData = stateDataWithIntegrationOutput();
    stateData.counters.consistencyCheckPasses = 3;
    const { ctx, transitionSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const updatedData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedData.counters.consistencyCheckPasses).toBe(4);
  });

  it('does not increment on delegation failure', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childThrows: new Error('Copilot unavailable'),
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SD-CHECK-006 – RemainingQuestionIds Interpolation
// ---------------------------------------------------------------------------

describe('SD-CHECK-006-RemainingQuestionIdsInterpolation', () => {
  it('{{remainingQuestionIdsJson}} is sourced from persisted integration output', async () => {
    const stateData = stateDataWithIntegrationOutput(['q-open-1', 'q-open-2']);
    const { ctx, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('["q-open-1","q-open-2"]');
  });

  it('uses empty array when no integration output exists', async () => {
    const stateData = createInitialStateData();
    const { ctx, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('remainingQuestionIdsFromIntegration: []');
  });

  it('includes specPath from persisted artifacts', async () => {
    const stateData = stateDataWithIntegrationOutput([], 'specs/my-draft.md');
    const { ctx, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('specs/my-draft.md');
  });

  it('includes constraints from workflow input', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, launchChildSpy } = createMockContext({
      input: { constraints: ['Use TypeScript', 'No external deps'] },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('Use TypeScript');
    expect(childInput.prompt).toContain('No external deps');
  });

  it('includes loopCount from consistencyCheckPasses counter', async () => {
    const stateData = stateDataWithIntegrationOutput();
    stateData.counters.consistencyCheckPasses = 2;
    const { ctx, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('currentLoopCount: 2');
  });
});

// ---------------------------------------------------------------------------
// SD-CHECK-007 – Option Description Pros/Cons Content
// ---------------------------------------------------------------------------

describe('SD-CHECK-007-OptionDescriptionProsConsContent', () => {
  it('accepts options with valid Pros: and Cons: in descriptions', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects options missing Pros: in description', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = validConsistencyOutput({
      followUpQuestions: [
        {
          questionId: 'q-bad-pros',
          kind: 'issue-resolution',
          prompt: 'Some question?',
          options: [
            { id: 1, label: 'A', description: 'Cons: some drawback' },
            { id: 2, label: 'B', description: 'Pros: benefit. Cons: drawback.' },
          ],
        },
      ],
    });
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Pros:');
  });

  it('rejects options missing Cons: in description', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = validConsistencyOutput({
      followUpQuestions: [
        {
          questionId: 'q-bad-cons',
          kind: 'issue-resolution',
          prompt: 'Some question?',
          options: [
            { id: 1, label: 'A', description: 'Pros: some benefit' },
            { id: 2, label: 'B', description: 'Pros: benefit. Cons: drawback.' },
          ],
        },
      ],
    });
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Cons:');
  });

  it('rejects options missing description entirely', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = validConsistencyOutput({
      followUpQuestions: [
        {
          questionId: 'q-no-desc',
          kind: 'issue-resolution',
          prompt: 'Some question?',
          options: [
            { id: 1, label: 'A' },
            { id: 2, label: 'B', description: 'Pros: ok. Cons: ok.' },
          ],
        },
      ],
    });
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('missing description');
  });

  it('Pros/Cons validation is skipped when followUpQuestions is empty (no options to check)', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = emptyConsistencyOutput();
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Queue persistence in state data
// ---------------------------------------------------------------------------

describe('Queue persistence in transitioned state data', () => {
  it('persists sorted queue in state data when follow-ups exist', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = validConsistencyOutput({
      followUpQuestions: [makeFollowUpQuestion('q-cc-2'), makeFollowUpQuestion('q-cc-1')],
    });
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    const updatedData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedData.queue).toHaveLength(2);
    expect(updatedData.queue.map((q) => q.questionId)).toEqual(['q-cc-1', 'q-cc-2']);
    expect(updatedData.queue.every((q) => q.answered === false)).toBe(true);
  });

  it('persists completion-confirmation queue when follow-ups are empty', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = emptyConsistencyOutput();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    const updatedData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedData.queue).toHaveLength(1);
    expect(updatedData.queue[0].kind).toBe('completion-confirmation');
    expect(updatedData.queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
    expect(updatedData.queue[0].answered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Delegation error handling
// ---------------------------------------------------------------------------

describe('Delegation error handling', () => {
  it('hard-fails on delegation error', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childThrows: new Error('Copilot unavailable'),
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Copilot unavailable');
  });

  it('hard-fails with non-Error delegation failure', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, failSpy } = createMockContext({
      childThrows: 'string error' as unknown as Error,
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Default state data handling
// ---------------------------------------------------------------------------

describe('Default state data handling', () => {
  it('works when data parameter is undefined (defaults to initial state)', async () => {
    const { ctx, transitionSpy, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, undefined);

    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

describe('Logging', () => {
  it('logs pass completion with relevant payload', async () => {
    const stateData = stateDataWithIntegrationOutput(['q-open-1']);
    const { ctx, logSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    const completionLog = logSpy.mock.calls.find((call: unknown[]) => {
      const event = call[0] as { message?: string };
      return event.message?.includes('LogicalConsistencyCheck pass');
    });
    expect(completionLog).toBeDefined();
    const payload = (completionLog![0] as { payload: Record<string, unknown> }).payload;
    expect(payload).toHaveProperty('blockingIssuesCount');
    expect(payload).toHaveProperty('followUpQuestionsCount');
    expect(payload).toHaveProperty('queueSize');
    expect(payload).toHaveProperty('readinessChecklist');
  });
});

// ---------------------------------------------------------------------------
// ITX-SD-013: All output variants route only to NumberedOptionsHumanRequest
// ---------------------------------------------------------------------------

describe('ITX-SD-013: All output variants route only to NumberedOptionsHumanRequest', () => {
  it('routes to NumberedOptionsHumanRequest with blocking issues and follow-ups', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const { ctx, transitionSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
  });

  it('routes to NumberedOptionsHumanRequest with no blocking issues and empty follow-ups', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = emptyConsistencyOutput();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
  });

  it('routes to NumberedOptionsHumanRequest with many follow-up questions', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const output = validConsistencyOutput({
      blockingIssues: [
        makeBlockingIssue({ id: 'issue-1' }),
        makeBlockingIssue({ id: 'issue-2' }),
        makeBlockingIssue({ id: 'issue-3' }),
      ],
      followUpQuestions: [
        makeFollowUpQuestion('q-cc-1'),
        makeFollowUpQuestion('q-cc-2'),
        makeFollowUpQuestion('q-cc-3'),
      ],
    });
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
  });

  it('never routes to Done regardless of model output', async () => {
    const stateData = stateDataWithIntegrationOutput();
    const scenarios = [
      validConsistencyOutput(),
      emptyConsistencyOutput(),
      validConsistencyOutput({ readinessChecklist: validReadinessChecklist() }),
    ];

    for (const output of scenarios) {
      const { ctx, transitionSpy, failSpy } = createMockContext({
        childOutput: {
          structuredOutput: output,
          structuredOutputRaw: JSON.stringify(output),
        },
      });

      await handleLogicalConsistencyCheck(ctx, stateData);

      if (transitionSpy.mock.calls.length > 0) {
        expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
        expect(transitionSpy.mock.calls[0][0]).not.toBe('Done');
      }
      // If failSpy was called, that's fine — no Done transition either way
      if (failSpy.mock.calls.length > 0) {
        expect(transitionSpy).not.toHaveBeenCalled();
      }
    }
  });
});
