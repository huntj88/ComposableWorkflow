import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  BaseNumberedQuestionItem,
  ClarificationFollowUpOutput,
  NormalizedAnswer,
  NumberedQuestionOption,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import type { CopilotAppBuilderOutput } from '../../../src/workflows/copilot-prompt.js';
import {
  handleExpandQuestionWithClarification,
  EXPAND_QUESTION_WITH_CLARIFICATION_STATE,
} from '../../../src/workflows/spec-doc/states/expand-question-with-clarification.js';
import {
  type SpecDocStateData,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';

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

function makeQueueItem(
  questionId: string,
  overrides?: Partial<QuestionQueueItem>,
): QuestionQueueItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve issue for ${questionId}`,
    options: [makeOption(1, 'Option A'), makeOption(2, 'Option B')],
    answered: false,
    ...overrides,
  };
}

function validFollowUpQuestion(
  overrides?: Partial<BaseNumberedQuestionItem>,
): BaseNumberedQuestionItem {
  return {
    questionId: 'q-cc-1-clarify-1',
    prompt: 'Should we use REST or RPC for the API?',
    options: [makeOption(1, 'REST API'), makeOption(2, 'RPC API')],
    ...overrides,
  };
}

function validExpandOutput(
  overrides?: Partial<ClarificationFollowUpOutput>,
): ClarificationFollowUpOutput {
  return {
    followUpQuestion: validFollowUpQuestion(),
    ...overrides,
  };
}

/**
 * Build state data that simulates the context when ExpandQuestionWithClarification
 * is entered: ClassifyCustomPrompt has set pendingClarification.
 */
function stateDataForExpansion(
  sourceQuestionId = 'q-cc-1',
  clarifyingQuestionText = 'Do you mean REST or RPC?',
): SpecDocStateData {
  const queue: QuestionQueueItem[] = [
    makeQueueItem(sourceQuestionId, { answered: true }),
    makeQueueItem('q-cc-2'),
    makeQueueItem('q-cc-3'),
  ];

  const answers: NormalizedAnswer[] = [
    {
      questionId: sourceQuestionId,
      selectedOptionIds: [1],
      text: 'I want a REST API',
      answeredAt: '2026-03-02T12:00:00.000Z',
    },
  ];

  return {
    ...createInitialStateData(),
    queue,
    queueIndex: 1, // Pointing at q-cc-2 (past the answered question)
    normalizedAnswers: answers,
    counters: {
      ...createInitialStateData().counters,
      clarificationLoopsUsed: 1,
    },
    pendingClarification: {
      sourceQuestionId,
      clarifyingQuestionText,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock context
// ---------------------------------------------------------------------------

interface MockCtxOptions {
  input?: Partial<SpecDocGenerationInput>;
  childOutput?: Partial<CopilotAppBuilderOutput>;
  childThrows?: Error;
}

function createMockContext(opts: MockCtxOptions = {}) {
  const output = opts.childOutput?.structuredOutput ?? validExpandOutput();

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
    constraints: ['Must use React'],
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

// ===========================================================================
// SD-CUSTOM-004 – Immediate Clarification Insertion
// ===========================================================================

describe('SD-CUSTOM-004-ImmediateClarificationInsertion', () => {
  it('generated follow-up inserts as immediate next queue item', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledTimes(1);
    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;

    // The follow-up was inserted at queueIndex (position 1), pushing q-cc-2 to position 2
    expect(updatedState.queue.length).toBe(4); // Original 3 + 1 inserted
    expect(updatedState.queue[1].questionId).toBe('q-cc-1-clarify-1');
    expect(updatedState.queue[2].questionId).toBe('q-cc-2');
    expect(updatedState.queue[3].questionId).toBe('q-cc-3');
  });

  it('follow-up is inserted ahead of older unresolved items', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;

    // The queueIndex points to where the follow-up was inserted
    expect(updatedState.queueIndex).toBe(1);
    // The item at queueIndex is the follow-up
    expect(updatedState.queue[updatedState.queueIndex].questionId).toBe('q-cc-1-clarify-1');
  });

  it('transitions to NumberedOptionsHumanRequest', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });
});

// ===========================================================================
// SD-CUSTOM-005 – Question Immutability
// ===========================================================================

describe('SD-CUSTOM-005-QuestionImmutability', () => {
  it('original asked question records are never mutated', async () => {
    const stateData = stateDataForExpansion();
    const originalQueue = stateData.queue.map((q) => ({ ...q }));
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    // Original state data queue was not mutated
    expect(stateData.queue).toEqual(originalQueue);
    expect(stateData.queue.length).toBe(3);

    // Updated queue has the new item but original items are unchanged
    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.queue[0]).toEqual(originalQueue[0]);
    // q-cc-2 and q-cc-3 shifted but content unchanged
    expect(updatedState.queue[2].questionId).toBe(originalQueue[1].questionId);
    expect(updatedState.queue[3].questionId).toBe(originalQueue[2].questionId);
  });

  it('original normalizedAnswers are not mutated', async () => {
    const stateData = stateDataForExpansion();
    const originalAnswers = [...stateData.normalizedAnswers];
    const { ctx } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(stateData.normalizedAnswers).toEqual(originalAnswers);
  });
});

// ===========================================================================
// SD-CUSTOM-006 – Clarification Pros/Cons Content
// ===========================================================================

describe('SD-CUSTOM-006-ClarificationProsConsContent', () => {
  it('clarification follow-up option descriptions include Pros: and Cons: guidance text', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    const insertedItem = updatedState.queue[1];

    for (const option of insertedItem.options) {
      expect(option.description).toBeDefined();
      expect(option.description).toContain('Pros:');
      expect(option.description).toContain('Cons:');
    }
  });

  it('hard-fails when option description is missing', async () => {
    const questionWithoutDesc: BaseNumberedQuestionItem = {
      questionId: 'q-cc-1-clarify-1',
      prompt: 'REST or RPC?',
      options: [
        { id: 1, label: 'REST' },
        { id: 2, label: 'RPC' },
      ],
    };
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: { followUpQuestion: questionWithoutDesc },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Pros/Cons validation failed');
  });

  it('hard-fails when option description lacks Pros:', async () => {
    const questionMissingPros: BaseNumberedQuestionItem = {
      questionId: 'q-cc-1-clarify-1',
      prompt: 'REST or RPC?',
      options: [
        { id: 1, label: 'REST', description: 'A RESTful approach. Cons: More boilerplate.' },
        { id: 2, label: 'RPC', description: 'An RPC approach. Cons: Less standard.' },
      ],
    };
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: { followUpQuestion: questionMissingPros },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Pros:');
  });

  it('hard-fails when option description lacks Cons:', async () => {
    const questionMissingCons: BaseNumberedQuestionItem = {
      questionId: 'q-cc-1-clarify-1',
      prompt: 'REST or RPC?',
      options: [
        { id: 1, label: 'REST', description: 'A RESTful approach. Pros: Standard.' },
        { id: 2, label: 'RPC', description: 'An RPC approach. Pros: Fast.' },
      ],
    };
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: { followUpQuestion: questionMissingCons },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Cons:');
  });
});

// ===========================================================================
// Workflow-assigned kind: issue-resolution
// ===========================================================================

describe('Workflow-assigned kind', () => {
  it('assigns kind: issue-resolution to the follow-up prior to queue insertion', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    const insertedItem = updatedState.queue[1];
    expect(insertedItem.kind).toBe('issue-resolution');
  });

  it('overrides any kind that may come from the copilot output', async () => {
    const followUp = validFollowUpQuestion();
    // Even if the copilot returns a different kind, workflow overrides it
    (followUp as { kind?: string }).kind = 'completion-confirmation';
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: { followUpQuestion: followUp },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    const insertedItem = updatedState.queue[1];
    expect(insertedItem.kind).toBe('issue-resolution');
  });
});

// ===========================================================================
// Distinct questionId validation
// ===========================================================================

describe('Distinct questionId validation', () => {
  it('hard-fails when follow-up questionId matches source questionId', async () => {
    const stateData = stateDataForExpansion('q-cc-1');
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: {
          followUpQuestion: validFollowUpQuestion({ questionId: 'q-cc-1' }),
        },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('must be distinct');
    expect(error.message).toContain('q-cc-1');
  });

  it('succeeds when follow-up questionId is distinct from source', async () => {
    const stateData = stateDataForExpansion('q-cc-1');
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: {
          followUpQuestion: validFollowUpQuestion({ questionId: 'q-cc-1-follow-1' }),
        },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Schema validation gate
// ===========================================================================

describe('Schema validation gate', () => {
  it('hard-fails when output does not match clarification-follow-up-output schema', async () => {
    const invalidOutput = { notFollowUpQuestion: true };
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain(EXPAND_QUESTION_WITH_CLARIFICATION_STATE);
    expect(error.message).toContain('schema validation failed');
  });

  it('hard-fails when followUpQuestion is missing required fields', async () => {
    const invalidOutput = {
      followUpQuestion: { questionId: 'q-1' }, // missing prompt, options
    };
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('schema validation failed');
  });
});

// ===========================================================================
// Error handling
// ===========================================================================

describe('Error handling', () => {
  it('hard-fails on delegation error', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, failSpy } = createMockContext({
      childThrows: new Error('Copilot unavailable'),
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Copilot unavailable');
  });

  it('fails when no pendingClarification in state data', async () => {
    const stateData = createInitialStateData();
    const { ctx, failSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('No pendingClarification');
  });

  it('fails when source question not found in queue', async () => {
    const stateData: SpecDocStateData = {
      ...createInitialStateData(),
      queue: [makeQueueItem('q-other')],
      queueIndex: 1,
      normalizedAnswers: [],
      pendingClarification: {
        sourceQuestionId: 'q-missing',
        clarifyingQuestionText: 'Clarify this',
      },
    };
    const { ctx, failSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Source question');
    expect(error.message).toContain('not found');
  });

  it('works when data parameter is undefined (defaults to initial state)', async () => {
    const { ctx, failSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, undefined);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('No pendingClarification');
  });
});

// ===========================================================================
// Prompt context
// ===========================================================================

describe('Prompt context', () => {
  it('includes source question context in the expansion prompt', async () => {
    const stateData = stateDataForExpansion('q-cc-1', 'Should this be a monolith?');
    const { ctx, launchChildSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('q-cc-1');
    expect(childInput.prompt).toContain('Resolve issue for q-cc-1');
    expect(childInput.prompt).toContain('Should this be a monolith?');
  });

  it('includes nextQuestionOrdinal hint in the prompt', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, launchChildSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    // First clarification from q-cc-1 → ordinal 1
    expect(childInput.prompt).toContain('1');
  });
});

// ===========================================================================
// copilotPromptOptions forwarding
// ===========================================================================

describe('copilotPromptOptions forwarding', () => {
  it('forwards copilotPromptOptions from workflow input to delegation', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, launchChildSpy } = createMockContext({
      input: {
        copilotPromptOptions: {
          baseArgs: ['--model', 'gpt-5.3'],
          allowedDirs: ['/workspace'],
          timeoutMs: 30000,
          cwd: '/project',
        },
      },
    });

    await handleExpandQuestionWithClarification(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toEqual(['--model', 'gpt-5.3']);
    expect(childInput.allowedDirs).toEqual(['/workspace']);
    expect(childInput.timeoutMs).toBe(30000);
    expect(childInput.cwd).toBe('/project');
  });
});

// ===========================================================================
// pendingClarification cleanup
// ===========================================================================

describe('pendingClarification cleanup', () => {
  it('clears pendingClarification after successful expansion', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.pendingClarification).toBeUndefined();
  });
});

// ===========================================================================
// Follow-up answered flag
// ===========================================================================

describe('Follow-up answered flag', () => {
  it('inserted follow-up has answered: false', async () => {
    const stateData = stateDataForExpansion();
    const { ctx, transitionSpy } = createMockContext();

    await handleExpandQuestionWithClarification(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    const insertedItem = updatedState.queue[1];
    expect(insertedItem.answered).toBe(false);
  });
});
