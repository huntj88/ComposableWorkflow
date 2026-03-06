import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  CustomPromptClassificationOutput,
  NormalizedAnswer,
  NumberedQuestionOption,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import type { CopilotAppBuilderOutput } from '../../../src/workflows/copilot-prompt.js';
import {
  handleClassifyCustomPrompt,
  CLASSIFY_CUSTOM_PROMPT_STATE,
} from '../../../src/workflows/spec-doc/states/classify-custom-prompt.js';
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

function validClassificationOutput(
  overrides?: Partial<CustomPromptClassificationOutput>,
): CustomPromptClassificationOutput {
  return {
    intent: 'custom-answer',
    customAnswerText: 'I want a REST API with GraphQL fallback',
    ...overrides,
  };
}

function clarifyingClassificationOutput(
  overrides?: Partial<CustomPromptClassificationOutput>,
): CustomPromptClassificationOutput {
  return {
    intent: 'clarifying-question',
    customQuestionText: 'Do you mean REST-first with GraphQL as a secondary interface?',
    ...overrides,
  };
}

function unrelatedClassificationOutput(
  overrides?: Partial<CustomPromptClassificationOutput>,
): CustomPromptClassificationOutput {
  return {
    intent: 'unrelated-question',
    customQuestionText: 'What auth implementation already exists in the repository?',
    ...overrides,
  };
}

/**
 * Build state data that simulates the context when ClassifyCustomPrompt is entered:
 * - A queue with at least one answered item
 * - queueIndex advanced past the answered item
 * - Last answer contains custom text
 */
function stateDataForClassification(
  questionId = 'q-cc-1',
  customText = 'I want a REST API',
): SpecDocStateData {
  const queue: QuestionQueueItem[] = [
    makeQueueItem(questionId, { answered: true }),
    makeQueueItem('q-cc-2'),
  ];

  const answers: NormalizedAnswer[] = [
    {
      questionId,
      selectedOptionIds: [1],
      text: customText,
      answeredAt: '2026-03-02T12:00:00.000Z',
    },
  ];

  return {
    ...createInitialStateData(),
    queue,
    queueIndex: 1, // Already advanced past the answered question
    normalizedAnswers: answers,
    counters: {
      ...createInitialStateData().counters,
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
  const output = opts.childOutput?.structuredOutput ?? validClassificationOutput();

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
// SD-CUSTOM-001 – Priority Classification Route
// ===========================================================================

describe('SD-CUSTOM-001-PriorityClassificationRoute', () => {
  it('responses with custom text route to classification first', async () => {
    const stateData = stateDataForClassification();
    const { ctx, launchChildSpy, transitionSpy } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    // Classification delegation was invoked
    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('q-cc-1');
    expect(childInput.prompt).toContain('I want a REST API');

    // Transition occurred
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('prompt includes the source question context', async () => {
    const stateData = stateDataForClassification('q-arch-1', 'What about microservices?');
    const { ctx, launchChildSpy } = createMockContext({
      childOutput: {
        structuredOutput: validClassificationOutput({
          customAnswerText: 'What about microservices?',
        }),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('q-arch-1');
    expect(childInput.prompt).toContain('Resolve issue for q-arch-1');
    expect(childInput.prompt).toContain('What about microservices?');
  });
});

// ===========================================================================
// SD-CUSTOM-002 – Intent As Single Truth
// ===========================================================================

describe('SD-CUSTOM-002-IntentAsSingleTruth', () => {
  it('routing depends only on validated structuredOutput.intent for custom-answer', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: validClassificationOutput(),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });

  it('routing depends only on validated structuredOutput.intent for clarifying-question', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: clarifyingClassificationOutput(),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith(
      'ExpandQuestionWithClarification',
      expect.any(Object),
    );
  });

  it('routing depends only on validated structuredOutput.intent for unrelated-question', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: unrelatedClassificationOutput(),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith(
      'ExpandQuestionWithClarification',
      expect.any(Object),
    );
  });
});

// ===========================================================================
// SD-CUSTOM-003 – Custom Answer Buffering
// ===========================================================================

describe('SD-CUSTOM-003-CustomAnswerBuffering', () => {
  it('custom-answer text is buffered with the current answer set', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: validClassificationOutput({
          customAnswerText: 'Use REST with OpenAPI spec',
        }),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledTimes(1);
    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;

    // Original answer is preserved
    expect(updatedState.normalizedAnswers[0]).toEqual(stateData.normalizedAnswers[0]);

    // Buffered answer includes the custom answer text
    expect(updatedState.normalizedAnswers.length).toBe(2);
    const buffered = updatedState.normalizedAnswers[1];
    expect(buffered.questionId).toBe('q-cc-1');
    expect(buffered.text).toBe('Use REST with OpenAPI spec');
    expect(buffered.selectedOptionIds).toEqual([1]); // Same as original
  });

  it('preserves existing answers immutably', async () => {
    const stateData = stateDataForClassification();
    const originalAnswers = [...stateData.normalizedAnswers];
    const { ctx } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    // Original state data was not mutated
    expect(stateData.normalizedAnswers).toEqual(originalAnswers);
    expect(stateData.normalizedAnswers.length).toBe(1);
  });

  it('transitions to NumberedOptionsHumanRequest after buffering', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });
});

// ===========================================================================
// Clarifying-question routing
// ===========================================================================

describe('Clarifying-question routing to ExpandQuestionWithClarification', () => {
  it('carries pendingClarification with sourceQuestionId and customQuestionText', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: clarifyingClassificationOutput({
          customQuestionText: 'Should the API be RESTful or RPC?',
        }),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledTimes(1);
    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.pendingClarification).toBeDefined();
    expect(updatedState.pendingClarification!.sourceQuestionId).toBe('q-cc-1');
    expect(updatedState.pendingClarification!.customQuestionText).toBe(
      'Should the API be RESTful or RPC?',
    );
    expect(updatedState.pendingClarification!.intent).toBe('clarifying-question');
    expect(updatedState.deferredQuestionIds).toEqual(['q-cc-1']);
    expect(updatedState.queue[0].answered).toBe(false);
  });

  it('rolls back the provisional numbered answer for clarifying-question intent', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: clarifyingClassificationOutput(),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.normalizedAnswers).toEqual([]);
  });

  it('reuses an existing deferred entry instead of pushing duplicates', async () => {
    const stateData = {
      ...stateDataForClassification(),
      deferredQuestionIds: ['q-cc-1'],
    } satisfies SpecDocStateData;
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: clarifyingClassificationOutput(),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.deferredQuestionIds).toEqual(['q-cc-1']);
  });
});

describe('Unrelated-question routing to ExpandQuestionWithClarification', () => {
  it('normalizes unrelated-question text into pendingClarification.customQuestionText', async () => {
    const stateData = stateDataForClassification();
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: unrelatedClassificationOutput({
          customQuestionText: 'Which package already owns auth token validation?',
        }),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    const updatedState = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedState.pendingClarification).toEqual({
      sourceQuestionId: 'q-cc-1',
      intent: 'unrelated-question',
      customQuestionText: 'Which package already owns auth token validation?',
    });
    expect(updatedState.normalizedAnswers).toEqual([]);
  });
});

// ===========================================================================
// Schema validation gate
// ===========================================================================

describe('Schema validation gate', () => {
  it('hard-fails when output does not match custom-prompt-classification-output schema', async () => {
    const invalidOutput = { intent: 'unknown-intent' };
    const stateData = stateDataForClassification();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain(CLASSIFY_CUSTOM_PROMPT_STATE);
    expect(error.message).toContain('schema validation failed');
  });

  it('hard-fails when custom-answer intent lacks customAnswerText', async () => {
    const invalidOutput = { intent: 'custom-answer' };
    const stateData = stateDataForClassification();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('schema validation failed');
  });

  it('hard-fails when clarifying-question intent lacks customQuestionText', async () => {
    const invalidOutput = { intent: 'clarifying-question' };
    const stateData = stateDataForClassification();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('schema validation failed');
  });

  it('hard-fails when unrelated-question intent lacks customQuestionText', async () => {
    const invalidOutput = { intent: 'unrelated-question' };
    const stateData = stateDataForClassification();
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleClassifyCustomPrompt(ctx, stateData);

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
    const stateData = stateDataForClassification();
    const { ctx, failSpy } = createMockContext({
      childThrows: new Error('Copilot unavailable'),
    });

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Copilot unavailable');
  });

  it('fails when no answers exist in state data', async () => {
    const stateData = createInitialStateData();
    const { ctx, failSpy } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('No answers in state data');
  });

  it('fails when source question is not found in queue', async () => {
    const stateData: SpecDocStateData = {
      ...createInitialStateData(),
      queue: [], // Empty queue
      queueIndex: 1,
      normalizedAnswers: [
        {
          questionId: 'q-missing',
          selectedOptionIds: [1],
          text: 'some text',
          answeredAt: '2026-03-02T12:00:00.000Z',
        },
      ],
    };
    const { ctx, failSpy } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Source question');
    expect(error.message).toContain('not found');
  });

  it('works when data parameter is undefined (defaults to initial state)', async () => {
    const { ctx, failSpy } = createMockContext();

    // With initial state there are no answers, so it should fail gracefully
    await handleClassifyCustomPrompt(ctx, undefined);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('No answers in state data');
  });
});

// ===========================================================================
// copilotPromptOptions forwarding
// ===========================================================================

describe('copilotPromptOptions forwarding', () => {
  it('forwards copilotPromptOptions from workflow input to delegation', async () => {
    const stateData = stateDataForClassification();
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

    await handleClassifyCustomPrompt(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toEqual(['--model', 'gpt-5.3']);
    expect(childInput.allowedDirs).toEqual(['/workspace']);
    expect(childInput.timeoutMs).toBe(30000);
    expect(childInput.cwd).toBe('/project');
  });
});

// ===========================================================================
// State data immutability
// ===========================================================================

describe('State data immutability', () => {
  it('does not mutate the original queue', async () => {
    const stateData = stateDataForClassification();
    const originalQueue = [...stateData.queue];
    const { ctx } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(stateData.queue).toEqual(originalQueue);
  });

  it('does not mutate the original counters', async () => {
    const stateData = stateDataForClassification();
    const originalCounters = { ...stateData.counters };
    const { ctx } = createMockContext();

    await handleClassifyCustomPrompt(ctx, stateData);

    expect(stateData.counters).toEqual(originalCounters);
  });
});
