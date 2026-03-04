import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  NormalizedAnswer,
  NumberedQuestionOption,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import {
  appendAnswer,
  createNormalizedAnswer,
  validateCompletionConfirmationCardinality,
  validateSelectedOptionIds,
} from '../../../src/workflows/spec-doc/answers.js';
import { handleNumberedOptionsHumanRequest } from '../../../src/workflows/spec-doc/states/numbered-options-human-request.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../../../src/workflows/spec-doc/queue.js';
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
    options: [makeOption(1, 'Option A'), makeOption(2, 'Option B'), makeOption(3, 'Option C')],
    answered: false,
    ...overrides,
  };
}

function makeCompletionItem(): QuestionQueueItem {
  return {
    questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
    kind: 'completion-confirmation',
    prompt: 'Is the specification document complete?',
    options: [makeOption(1, 'Yes, the spec is done'), makeOption(2, 'No, continue refining')],
    answered: false,
  };
}

function stateDataWithQueue(
  items: QuestionQueueItem[],
  overrides?: Partial<SpecDocStateData>,
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    queue: items,
    queueIndex: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock context
// ---------------------------------------------------------------------------

interface MockChildOutput {
  status: 'responded' | 'cancelled';
  response?: {
    questionId: string;
    selectedOptionIds?: number[];
    text?: string;
  };
  respondedAt?: string;
  cancelledAt?: string;
}

interface MockCtxOptions {
  input?: Partial<SpecDocGenerationInput>;
  childOutput?: MockChildOutput;
  childThrows?: Error;
}

function createMockContext(opts: MockCtxOptions = {}) {
  const defaultChildOutput: MockChildOutput = opts.childOutput ?? {
    status: 'responded',
    response: {
      questionId: 'q-1',
      selectedOptionIds: [1],
    },
    respondedAt: '2026-03-03T12:00:01Z',
  };

  const launchChildSpy = opts.childThrows
    ? vi.fn().mockRejectedValue(opts.childThrows)
    : vi.fn().mockResolvedValue(defaultChildOutput);
  const transitionSpy = vi.fn();
  const failSpy = vi.fn();
  const logSpy = vi.fn();
  const completeSpy = vi.fn();

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
    now: () => new Date('2026-03-03T12:00:00Z'),
    log: logSpy,
    transition: transitionSpy,
    launchChild: launchChildSpy,
    runCommand: vi.fn(),
    complete: completeSpy,
    fail: failSpy,
  } as unknown as WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>;

  return { ctx, launchChildSpy, transitionSpy, failSpy, logSpy, completeSpy };
}

// ===========================================================================
// Answers Module Tests
// ===========================================================================

describe('answers – validateSelectedOptionIds', () => {
  const item = makeQueueItem('q-1');

  it('returns undefined for valid option IDs', () => {
    expect(validateSelectedOptionIds(item, [1])).toBeUndefined();
    expect(validateSelectedOptionIds(item, [1, 2])).toBeUndefined();
    expect(validateSelectedOptionIds(item, [1, 2, 3])).toBeUndefined();
  });

  it('returns error for undefined selectedOptionIds', () => {
    const err = validateSelectedOptionIds(item, undefined);
    expect(err).toBeDefined();
    expect(err).toContain('No selectedOptionIds');
  });

  it('returns error for empty selectedOptionIds', () => {
    const err = validateSelectedOptionIds(item, []);
    expect(err).toBeDefined();
    expect(err).toContain('No selectedOptionIds');
  });

  it('returns error for out-of-range option IDs', () => {
    const err = validateSelectedOptionIds(item, [99]);
    expect(err).toBeDefined();
    expect(err).toContain('Invalid selectedOptionIds');
    expect(err).toContain('99');
  });

  it('returns error for partially invalid option IDs', () => {
    const err = validateSelectedOptionIds(item, [1, 99]);
    expect(err).toBeDefined();
    expect(err).toContain('99');
  });
});

describe('answers – validateCompletionConfirmationCardinality', () => {
  const completionItem = makeCompletionItem();
  const regularItem = makeQueueItem('q-1');

  it('returns undefined for non-completion items', () => {
    expect(validateCompletionConfirmationCardinality(regularItem, [1, 2])).toBeUndefined();
  });

  it('returns undefined for completion item with exactly one selection', () => {
    expect(validateCompletionConfirmationCardinality(completionItem, [1])).toBeUndefined();
  });

  it('returns error for completion item with zero selections', () => {
    const err = validateCompletionConfirmationCardinality(completionItem, []);
    expect(err).toBeDefined();
    expect(err).toContain('exactly one');
  });

  it('returns error for completion item with multiple selections', () => {
    const err = validateCompletionConfirmationCardinality(completionItem, [1, 2]);
    expect(err).toBeDefined();
    expect(err).toContain('exactly one');
  });

  it('returns error for completion item with undefined selections', () => {
    const err = validateCompletionConfirmationCardinality(completionItem, undefined);
    expect(err).toBeDefined();
    expect(err).toContain('exactly one');
  });
});

describe('answers – createNormalizedAnswer', () => {
  it('creates answer record with required fields', () => {
    const answer = createNormalizedAnswer('q-1', [1, 2], '2026-03-03T12:00:00Z');
    expect(answer).toEqual({
      questionId: 'q-1',
      selectedOptionIds: [1, 2],
      answeredAt: '2026-03-03T12:00:00Z',
    });
  });

  it('includes optional text when provided', () => {
    const answer = createNormalizedAnswer('q-1', [1], '2026-03-03T12:00:00Z', 'Custom text');
    expect(answer.text).toBe('Custom text');
  });

  it('omits text field when not provided', () => {
    const answer = createNormalizedAnswer('q-1', [1], '2026-03-03T12:00:00Z');
    expect(answer).not.toHaveProperty('text');
  });
});

describe('answers – appendAnswer', () => {
  it('appends answer to empty list', () => {
    const answer = createNormalizedAnswer('q-1', [1], '2026-03-03T12:00:00Z');
    const result = appendAnswer([], answer);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(answer);
  });

  it('appends answer to existing list without mutating original', () => {
    const existing: NormalizedAnswer[] = [
      createNormalizedAnswer('q-1', [1], '2026-03-03T12:00:00Z'),
    ];
    const newAnswer = createNormalizedAnswer('q-2', [2], '2026-03-03T12:01:00Z');
    const result = appendAnswer(existing, newAnswer);

    expect(result).toHaveLength(2);
    expect(existing).toHaveLength(1); // original not mutated
    expect(result[1]).toEqual(newAnswer);
  });
});

// ===========================================================================
// State Handler Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// SD-HRQ-001: One feedback child run per queue item
// ---------------------------------------------------------------------------

describe('SD-HRQ-001-OneChildPerQuestion', () => {
  it('launches exactly one feedback child run per queue item invocation', async () => {
    const queue = [makeQueueItem('q-1'), makeQueueItem('q-2')];
    const stateData = stateDataWithQueue(queue);

    const { ctx, launchChildSpy, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    expect(launchChildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowType: 'server.human-feedback.v1',
        input: expect.objectContaining({
          questionId: 'q-1',
        }),
      }),
    );
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('child input includes requestedByRunId and requestedByWorkflowType', async () => {
    const queue = [makeQueueItem('q-1')];
    const stateData = stateDataWithQueue(queue);

    const { ctx, launchChildSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const childCall = launchChildSpy.mock.calls[0][0];
    expect(childCall.input.requestedByRunId).toBe('run-001');
    expect(childCall.input.requestedByWorkflowType).toBe('app-builder.spec-doc.v1');
    expect(childCall.input.requestedByState).toBe('NumberedOptionsHumanRequest');
  });

  it('child input prompt and options match queue item', async () => {
    const item = makeQueueItem('q-test', {
      prompt: 'Important question',
      options: [makeOption(1, 'First'), makeOption(2, 'Second')],
    });
    const stateData = stateDataWithQueue([item]);

    const { ctx, launchChildSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-test', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toBe('Important question');
    expect(childInput.options).toHaveLength(2);
    expect(childInput.options[0].label).toBe('First');
  });
});

// ---------------------------------------------------------------------------
// SD-HRQ-002: Stable question ID linkage
// ---------------------------------------------------------------------------

describe('SD-HRQ-002-StableQuestionLinkage', () => {
  it('questionId is passed to child and preserved in answer', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-stable-id')]);

    const { ctx, launchChildSpy, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-stable-id', selectedOptionIds: [2] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Verify child received the questionId
    expect(launchChildSpy.mock.calls[0][0].input.questionId).toBe('q-stable-id');

    // Verify answer has the questionId
    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(1);
    expect(updatedStateData.normalizedAnswers[0].questionId).toBe('q-stable-id');
  });
});

// ---------------------------------------------------------------------------
// SD-HRQ-003: Normalized answer persistence
// ---------------------------------------------------------------------------

describe('SD-HRQ-003-NormalizedAnswerPersistence', () => {
  it('records normalized answer with questionId, selectedOptionIds, answeredAt', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [2] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(1);

    const answer = updatedStateData.normalizedAnswers[0];
    expect(answer.questionId).toBe('q-1');
    expect(answer.selectedOptionIds).toEqual([2]);
    expect(answer.answeredAt).toBe('2026-03-03T12:00:00.000Z');
  });

  it('records optional text in answer when provided', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1], text: 'My custom input' },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers[0].text).toBe('My custom input');
  });

  it('accumulates answers across multiple invocations (append-only)', async () => {
    const existingAnswer = createNormalizedAnswer('q-prev', [1], '2026-03-03T11:00:00Z');
    const stateData = stateDataWithQueue(
      [makeQueueItem('q-prev', { answered: true }), makeQueueItem('q-current')],
      {
        queueIndex: 1,
        normalizedAnswers: [existingAnswer],
      },
    );

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-current', selectedOptionIds: [3] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(2);
    expect(updatedStateData.normalizedAnswers[0]).toEqual(existingAnswer); // preserved
    expect(updatedStateData.normalizedAnswers[1].questionId).toBe('q-current');
  });

  it('marks current queue item as answered', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.queue[0].answered).toBe(true);
    expect(updatedStateData.queue[1].answered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B-SD-HFB-002: Invalid selectedOptionIds do not record an answer
// ---------------------------------------------------------------------------

describe('B-SD-HFB-002-InvalidOptionIds', () => {
  it('self-loops with unchanged state when selectedOptionIds are invalid', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [99] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', stateData);

    // No answer recorded
    const passedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(passedStateData.normalizedAnswers).toHaveLength(0);
  });

  it('self-loops when selectedOptionIds are empty', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', stateData);
  });

  it('self-loops when selectedOptionIds are undefined', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1' },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', stateData);
  });

  it('question remains pending (not marked answered) on invalid response', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [99] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const passedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(passedStateData.queue[0].answered).toBe(false);
    expect(passedStateData.queueIndex).toBe(0); // same index
  });
});

// ---------------------------------------------------------------------------
// B-SD-HFB-003: Completion confirmation cardinality
// ---------------------------------------------------------------------------

describe('B-SD-HFB-003-CompletionConfirmationCardinality', () => {
  it('self-loops when completion-confirmation has zero selections', async () => {
    const stateData = stateDataWithQueue([makeCompletionItem()]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: COMPLETION_CONFIRMATION_QUESTION_ID, selectedOptionIds: [] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', stateData);
  });

  it('self-loops when completion-confirmation has multiple selections', async () => {
    const stateData = stateDataWithQueue([makeCompletionItem()]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
          selectedOptionIds: [1, 2],
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', stateData);
  });
});

// ---------------------------------------------------------------------------
// B-SD-TRANS-004: Self-loop for remaining queued questions
// ---------------------------------------------------------------------------

describe('B-SD-TRANS-004-SelfLoop', () => {
  it('transitions to self on valid response with remaining queue items', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('NumberedOptionsHumanRequest', expect.any(Object));
  });

  it('advances queueIndex on self-loop', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.queueIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B-SD-TRANS-006: Queue exhaustion routes to IntegrateIntoSpec
// ---------------------------------------------------------------------------

describe('SD-HRQ-004-QueueExhaustionToIntegrate', () => {
  it('transitions to IntegrateIntoSpec when queue is exhausted (non-completion)', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-only')]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-only', selectedOptionIds: [2] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', expect.any(Object));
  });

  it('carries accumulated answers when transitioning to IntegrateIntoSpec', async () => {
    const existingAnswer = createNormalizedAnswer('q-prev', [1], '2026-03-03T11:00:00Z');
    const stateData = stateDataWithQueue(
      [makeQueueItem('q-prev', { answered: true }), makeQueueItem('q-last')],
      {
        queueIndex: 1,
        normalizedAnswers: [existingAnswer],
      },
    );

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-last', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(2);
    expect(updatedStateData.normalizedAnswers[0].questionId).toBe('q-prev');
    expect(updatedStateData.normalizedAnswers[1].questionId).toBe('q-last');
  });
});

// ---------------------------------------------------------------------------
// Completion-confirmation: Done route
// ---------------------------------------------------------------------------

describe('B-SD-TRANS-007-CompletionConfirmed', () => {
  it('transitions to Done when completion is confirmed (option 1)', async () => {
    const stateData = stateDataWithQueue([makeCompletionItem()]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
          selectedOptionIds: [1],
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('Done', expect.any(Object));
  });

  it('transitions to IntegrateIntoSpec when completion is declined (option 2)', async () => {
    const stateData = stateDataWithQueue([makeCompletionItem()]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
          selectedOptionIds: [2],
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// B-SD-TRANS-005: Custom text routes to ClassifyCustomPrompt
// ---------------------------------------------------------------------------

describe('B-SD-TRANS-005-CustomTextRoute', () => {
  it('routes to ClassifyCustomPrompt when response includes text', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: 'q-1',
          selectedOptionIds: [1],
          text: 'I think we should also consider X',
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('ClassifyCustomPrompt', expect.any(Object));
  });

  it('custom text takes precedence over queue self-loop', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: 'q-1',
          selectedOptionIds: [2],
          text: 'Custom context here',
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Routes to ClassifyCustomPrompt, NOT self-loop
    expect(transitionSpy.mock.calls[0][0]).toBe('ClassifyCustomPrompt');
  });

  it('records normalized answer before routing to ClassifyCustomPrompt', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: 'q-1',
          selectedOptionIds: [1],
          text: 'Additional details',
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(1);
    expect(updatedStateData.normalizedAnswers[0].questionId).toBe('q-1');
    expect(updatedStateData.normalizedAnswers[0].text).toBe('Additional details');
  });

  it('ignores whitespace-only text (no route to ClassifyCustomPrompt)', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1'), makeQueueItem('q-2')]);

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: {
          questionId: 'q-1',
          selectedOptionIds: [1],
          text: '   ',
        },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Should self-loop, not ClassifyCustomPrompt
    expect(transitionSpy.mock.calls[0][0]).toBe('NumberedOptionsHumanRequest');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('fails when queue is empty', async () => {
    const stateData = stateDataWithQueue([]);

    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Queue is empty');
  });

  it('does NOT fail when queueIndex is past end — routes via exhaustion logic', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1', { answered: true })], {
      queueIndex: 1,
      normalizedAnswers: [createNormalizedAnswer('q-1', [2], '2026-03-03T12:00:00Z')],
    });

    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', expect.any(Object));
  });

  it('fails when child launch throws an error', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, failSpy, transitionSpy } = createMockContext({
      childThrows: new Error('Network failure'),
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Network failure');
  });

  it('fails when feedback is cancelled', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, failSpy } = createMockContext({
      childOutput: {
        status: 'cancelled',
        cancelledAt: '2026-03-03T12:00:01Z',
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('cancelled');
  });

  it('fails when response payload is missing', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, failSpy } = createMockContext({
      childOutput: {
        status: 'responded',
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('response missing');
  });

  it('uses createInitialStateData when data is undefined', async () => {
    const { ctx, failSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, undefined);

    // Empty queue → fails with empty queue error
    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Queue is empty');
  });
});

// ---------------------------------------------------------------------------
// B-SD-TRANS-012: Re-entry with exhausted queue (queue-exhaustion routing)
// ---------------------------------------------------------------------------

describe('B-SD-TRANS-012-ExhaustedQueueReEntry', () => {
  it('routes to IntegrateIntoSpec when re-entered with exhausted queue (no completion-confirmation done)', async () => {
    // Simulate: single question answered, ClassifyCustomPrompt returned to us
    // with queueIndex already past end.
    const stateData = stateDataWithQueue([makeQueueItem('q-1', { answered: true })], {
      queueIndex: 1,
      normalizedAnswers: [
        createNormalizedAnswer('q-1', [2], '2026-03-03T12:00:00Z', 'custom text'),
      ],
    });

    const { ctx, failSpy, transitionSpy, launchChildSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(launchChildSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', stateData);
  });

  it('routes to Done when re-entered with exhausted queue and completion-confirmation done option was selected', async () => {
    // Simulate: completion-confirmation was answered with option 1 (done) + custom text,
    // ClassifyCustomPrompt classified as custom-answer and returned.
    const completionItem = makeCompletionItem();
    completionItem.answered = true;
    const stateData = stateDataWithQueue([completionItem], {
      queueIndex: 1,
      normalizedAnswers: [
        createNormalizedAnswer(
          COMPLETION_CONFIRMATION_QUESTION_ID,
          [1],
          '2026-03-03T12:00:00Z',
          'Looks great, ship it!',
        ),
      ],
    });

    const { ctx, failSpy, transitionSpy, launchChildSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(launchChildSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('Done', stateData);
  });

  it('routes to IntegrateIntoSpec when completion-confirmation selected option 2 (not done)', async () => {
    const completionItem = makeCompletionItem();
    completionItem.answered = true;
    const stateData = stateDataWithQueue([completionItem], {
      queueIndex: 1,
      normalizedAnswers: [
        createNormalizedAnswer(
          COMPLETION_CONFIRMATION_QUESTION_ID,
          [2],
          '2026-03-03T12:00:00Z',
          'Need more refinement',
        ),
      ],
    });

    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', stateData);
  });

  it('still hard-fails when queue is truly empty (length 0)', async () => {
    const stateData = stateDataWithQueue([], { queueIndex: 0 });

    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Queue is empty');
  });

  it('does not launch any child run when queue is exhausted on re-entry', async () => {
    const stateData = stateDataWithQueue(
      [makeQueueItem('q-1', { answered: true }), makeQueueItem('q-2', { answered: true })],
      {
        queueIndex: 2,
        normalizedAnswers: [
          createNormalizedAnswer('q-1', [1], '2026-03-03T11:00:00Z'),
          createNormalizedAnswer('q-2', [2], '2026-03-03T12:00:00Z', 'custom text'),
        ],
      },
    );

    const { ctx, failSpy, launchChildSpy, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(failSpy).not.toHaveBeenCalled();
    expect(launchChildSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', stateData);
  });

  it('passes state data unchanged to transition target on exhaustion re-entry', async () => {
    const answers = [
      createNormalizedAnswer('q-1', [1], '2026-03-03T11:00:00Z'),
      createNormalizedAnswer('q-1', [2], '2026-03-03T12:00:00Z', 'supplementary'),
    ];
    const stateData = stateDataWithQueue([makeQueueItem('q-1', { answered: true })], {
      queueIndex: 1,
      normalizedAnswers: answers,
    });

    const { ctx, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    const passedData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(passedData).toBe(stateData); // same reference, not modified
    expect(passedData.normalizedAnswers).toHaveLength(2);
  });

  it('uses the LAST completion-confirmation answer for routing (multiple answers for same questionId)', async () => {
    // Edge case: completion-confirmation answered twice (e.g., first said done, then
    // a subsequent cycle appended a not-done answer). The LAST one wins.
    const completionItem = makeCompletionItem();
    completionItem.answered = true;
    const stateData = stateDataWithQueue([completionItem], {
      queueIndex: 1,
      normalizedAnswers: [
        createNormalizedAnswer(COMPLETION_CONFIRMATION_QUESTION_ID, [1], '2026-03-03T11:00:00Z'),
        createNormalizedAnswer(
          COMPLETION_CONFIRMATION_QUESTION_ID,
          [2],
          '2026-03-03T12:00:00Z',
          'Actually no, keep going',
        ),
      ],
    });

    const { ctx, transitionSpy } = createMockContext();

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Last answer selected option 2 → IntegrateIntoSpec, not Done
    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', stateData);
  });
});

// ---------------------------------------------------------------------------
// B-SD-QUEUE-004: Answer accumulation across queue processing
// ---------------------------------------------------------------------------

describe('B-SD-QUEUE-004-AnswerAccumulation', () => {
  it('all accumulated answers available when transitioning to IntegrateIntoSpec', async () => {
    // Simulate: q-1 already answered, now answering q-2 (last item)
    const answer1 = createNormalizedAnswer('q-1', [1], '2026-03-03T11:00:00Z');
    const stateData = stateDataWithQueue(
      [makeQueueItem('q-1', { answered: true }), makeQueueItem('q-2')],
      {
        queueIndex: 1,
        normalizedAnswers: [answer1],
      },
    );

    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-2', selectedOptionIds: [3] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(transitionSpy).toHaveBeenCalledWith('IntegrateIntoSpec', expect.any(Object));
    const updatedStateData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(updatedStateData.normalizedAnswers).toHaveLength(2);
    expect(updatedStateData.normalizedAnswers[0].questionId).toBe('q-1');
    expect(updatedStateData.normalizedAnswers[0].selectedOptionIds).toEqual([1]);
    expect(updatedStateData.normalizedAnswers[1].questionId).toBe('q-2');
    expect(updatedStateData.normalizedAnswers[1].selectedOptionIds).toEqual([3]);
    expect(updatedStateData.normalizedAnswers[1].answeredAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// B-SD-HFB-004: Feedback child uses server-owned contract only
// ---------------------------------------------------------------------------

describe('B-SD-HFB-004-ServerOwnedContract', () => {
  it('launches child with workflowType server.human-feedback.v1', async () => {
    const stateData = stateDataWithQueue([makeQueueItem('q-1')]);

    const { ctx, launchChildSpy } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(launchChildSpy.mock.calls[0][0].workflowType).toBe('server.human-feedback.v1');
  });
});

// ---------------------------------------------------------------------------
// Per-question immutability
// ---------------------------------------------------------------------------

describe('Per-question immutability', () => {
  it('original queue items are not mutated', async () => {
    const originalItem = makeQueueItem('q-1');
    const originalAnswered = originalItem.answered;
    const stateData = stateDataWithQueue([originalItem, makeQueueItem('q-2')]);

    const { ctx } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-1', selectedOptionIds: [1] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    // Original item should not have been mutated
    expect(originalItem.answered).toBe(originalAnswered);
  });

  it('original normalizedAnswers array is not mutated', async () => {
    const existingAnswer = createNormalizedAnswer('q-prev', [1], '2026-03-03T11:00:00Z');
    const originalAnswers = [existingAnswer];
    const stateData = stateDataWithQueue(
      [makeQueueItem('q-prev', { answered: true }), makeQueueItem('q-current')],
      {
        queueIndex: 1,
        normalizedAnswers: originalAnswers,
      },
    );

    const { ctx } = createMockContext({
      childOutput: {
        status: 'responded',
        response: { questionId: 'q-current', selectedOptionIds: [2] },
      },
    });

    await handleNumberedOptionsHumanRequest(ctx, stateData);

    expect(originalAnswers).toHaveLength(1); // original not mutated
  });
});
