import { describe, expect, it } from 'vitest';

import type {
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
  ConsistencyFollowUpChildInput,
  IntegrateIntoSpecInput,
  NormalizedAnswer,
  SpecActionableItem,
  SpecIntegrationOutput,
  ConsistencyCheckOutput,
  CustomPromptClassificationOutput,
  ClarificationFollowUpOutput,
  NumberedQuestionItem,
  QuestionQueueItem,
} from '../../../src/workflows/spec-doc/contracts.js';

import { createSpecDocValidator } from '../../../src/workflows/spec-doc/schema-validation.js';

import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validNormalizedAnswer(overrides?: Partial<NormalizedAnswer>): NormalizedAnswer {
  return {
    questionId: 'q-1',
    selectedOptionIds: [1],
    answeredAt: '2026-03-02T12:00:00Z',
    ...overrides,
  };
}

function validActionableItem(overrides?: Partial<SpecActionableItem>): SpecActionableItem {
  return {
    itemId: 'act-1',
    instruction: 'Add an explicit interfaces section.',
    rationale: 'The current draft omits integration contract details.',
    blockingIssueIds: ['issue-interfaces'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpecDocGenerationInput', () => {
  it('satisfies minimal shape', () => {
    const input: SpecDocGenerationInput = { request: 'Build a TODO app' };
    expect(input.request).toBe('Build a TODO app');
  });

  it('carries all optional fields', () => {
    const input: SpecDocGenerationInput = {
      request: 'Build a TODO app',
      targetPath: 'specs/todo.md',
      constraints: ['must use React'],
      copilotPromptOptions: {
        baseArgs: ['--model', 'gpt-5.3'],
        allowedDirs: ['/workspace'],
        timeoutMs: 30000,
        cwd: '/workspace',
      },
    };
    expect(input.constraints).toHaveLength(1);
    expect(input.copilotPromptOptions?.timeoutMs).toBe(30000);
  });
});

describe('SpecDocGenerationOutput', () => {
  it('satisfies terminal output shape', () => {
    const output: SpecDocGenerationOutput = {
      status: 'completed',
      specPath: 'specs/todo.md',
      summary: { unresolvedQuestions: 0 },
      artifacts: { integrationPasses: 3, consistencyCheckPasses: 2 },
    };
    expect(output.status).toBe('completed');
    expect(output.summary.unresolvedQuestions).toBe(0);
  });

  it('validates against spec-doc-generation-output schema', () => {
    const output: SpecDocGenerationOutput = {
      status: 'completed',
      specPath: 'specs/todo.md',
      summary: { unresolvedQuestions: 0 },
      artifacts: { integrationPasses: 1, consistencyCheckPasses: 1 },
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(true);
  });
});

describe('ConsistencyFollowUpChildInput', () => {
  it('captures the delegated child input contract', () => {
    const input: ConsistencyFollowUpChildInput = {
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      constraints: ['React'],
      loopCount: 2,
      remainingQuestionIds: ['q-1', 'q-2'],
    };

    expect(input.specPath).toBe('specs/todo.md');
    expect(input.loopCount).toBe(2);
    expect(input.remainingQuestionIds).toEqual(['q-1', 'q-2']);
  });
});

describe('IntegrateIntoSpecInput', () => {
  it('supports workflow-input source (initial pass)', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'workflow-input',
      request: 'Build a TODO app',
      targetPath: 'specs/todo.md',
      constraints: ['React', 'TypeScript'],
    };
    expect(input.source).toBe('workflow-input');
    expect(input.answers).toBeUndefined();
  });

  it('supports numbered-options-feedback source with answers', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'numbered-options-feedback',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      answers: [
        validNormalizedAnswer(),
        validNormalizedAnswer({ questionId: 'q-2', selectedOptionIds: [2] }),
      ],
    };
    expect(input.source).toBe('numbered-options-feedback');
    expect(input.answers).toHaveLength(2);
  });

  it('supports consistency-action-items source with ordered actionableItems', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'consistency-action-items',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      actionableItems: [
        validActionableItem({ itemId: 'act-2' }),
        validActionableItem({ itemId: 'act-1', instruction: 'Add non-goals.' }),
      ],
    };
    expect(input.source).toBe('consistency-action-items');
    expect(input.actionableItems).toHaveLength(2);
    expect(input.actionableItems[0]!.itemId).toBe('act-2');
  });

  it('validates workflow-input against spec-integration-input schema', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'workflow-input',
      request: 'Build a TODO app',
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(input, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });

  it('validates numbered-options-feedback against spec-integration-input schema', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'numbered-options-feedback',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      answers: [validNormalizedAnswer()],
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(input, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });

  it('validates consistency-action-items against spec-integration-input schema', () => {
    const input: IntegrateIntoSpecInput = {
      source: 'consistency-action-items',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      actionableItems: [validActionableItem()],
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(input, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });

  it('rejects numbered-options-feedback without answers', () => {
    const input = {
      source: 'numbered-options-feedback',
      request: 'Build a TODO app',
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(input, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(false);
  });

  it('rejects consistency-action-items without actionableItems', () => {
    const input = {
      source: 'consistency-action-items',
      request: 'Build a TODO app',
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(input, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(false);
  });
});

describe('NormalizedAnswer', () => {
  it('has required fields', () => {
    const answer = validNormalizedAnswer();
    expect(answer.questionId).toBe('q-1');
    expect(answer.selectedOptionIds).toEqual([1]);
    expect(answer.answeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('allows empty selectedOptionIds with text-only', () => {
    const answer = validNormalizedAnswer({
      selectedOptionIds: [],
      text: 'Custom answer',
    });
    expect(answer.selectedOptionIds).toEqual([]);
    expect(answer.text).toBe('Custom answer');
  });
});

describe('SpecIntegrationOutput', () => {
  it('satisfies shape', () => {
    const output: SpecIntegrationOutput = {
      specPath: 'specs/todo.md',
      changeSummary: ['Added scope section'],
      resolvedQuestionIds: ['q-1'],
      remainingQuestionIds: ['q-2'],
    };
    expect(output.specPath).toMatch(/\.md$/);
  });

  it('validates against spec-integration-output schema', () => {
    const output: SpecIntegrationOutput = {
      specPath: 'specs/todo.md',
      changeSummary: ['Added scope section'],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    };
    const validator = createSpecDocValidator();
    const result = validator.validateParsed(output, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(true);
  });
});

describe('ConsistencyCheckOutput', () => {
  it('satisfies shape with follow-up questions', () => {
    const output: ConsistencyCheckOutput = {
      blockingIssues: [
        { id: 'issue-1', description: 'Missing scope', severity: 'high', section: 'scope' },
      ],
      actionableItems: [],
      followUpQuestions: [
        {
          questionId: 'q-1',
          kind: 'issue-resolution',
          prompt: 'What is the project scope?',
          options: [
            { id: 1, label: 'Web app', description: 'Pros: broad reach. Cons: browser limits.' },
            { id: 2, label: 'CLI tool', description: 'Pros: scriptable. Cons: no GUI.' },
          ],
        },
      ],
      readinessChecklist: {
        hasScopeAndObjective: false,
        hasNonGoals: true,
        hasConstraintsAndAssumptions: true,
        hasInterfacesOrContracts: false,
        hasTestableAcceptanceCriteria: false,
        hasNoContradictions: false,
        hasSufficientDetail: false,
      },
    };
    expect(output.blockingIssues).toHaveLength(1);
    expect(output.followUpQuestions[0]!.kind).toBe('issue-resolution');
  });

  it('allows empty follow-up questions (completion path)', () => {
    const output: ConsistencyCheckOutput = {
      blockingIssues: [],
      actionableItems: [],
      followUpQuestions: [],
      readinessChecklist: {
        hasScopeAndObjective: true,
        hasNonGoals: true,
        hasConstraintsAndAssumptions: true,
        hasInterfacesOrContracts: true,
        hasTestableAcceptanceCriteria: true,
        hasNoContradictions: true,
        hasSufficientDetail: true,
      },
    };
    expect(output.followUpQuestions).toHaveLength(0);
  });

  it('supports actionable-items-only aggregate results', () => {
    const output: ConsistencyCheckOutput = {
      blockingIssues: [{ id: 'issue-1', description: 'Missing API example', severity: 'medium' }],
      actionableItems: [validActionableItem()],
      followUpQuestions: [],
      readinessChecklist: {
        hasScopeAndObjective: true,
        hasNonGoals: true,
        hasConstraintsAndAssumptions: true,
        hasInterfacesOrContracts: false,
        hasTestableAcceptanceCriteria: true,
        hasNoContradictions: true,
        hasSufficientDetail: false,
      },
    };

    expect(output.actionableItems).toHaveLength(1);
    expect(output.followUpQuestions).toHaveLength(0);
  });
});

describe('CustomPromptClassificationOutput', () => {
  it('represents clarifying-question intent', () => {
    const output: CustomPromptClassificationOutput = {
      intent: 'clarifying-question',
      customQuestionText: 'What database should we use?',
    };
    expect(output.intent).toBe('clarifying-question');
  });

  it('represents unrelated-question intent', () => {
    const output: CustomPromptClassificationOutput = {
      intent: 'unrelated-question',
      customQuestionText: 'What does the repository already implement for auth?',
    };
    expect(output.intent).toBe('unrelated-question');
  });

  it('represents custom-answer intent', () => {
    const output: CustomPromptClassificationOutput = {
      intent: 'custom-answer',
      customAnswerText: 'Use PostgreSQL for the database.',
    };
    expect(output.intent).toBe('custom-answer');
  });
});

describe('ClarificationFollowUpOutput', () => {
  it('wraps a base numbered question item', () => {
    const output: ClarificationFollowUpOutput = {
      researchOutcome: 'needs-follow-up-question',
      researchSummary: 'Research found an unresolved database decision.',
      followUpQuestion: {
        questionId: 'q-2',
        prompt: 'Which database engine?',
        options: [
          { id: 1, label: 'PostgreSQL' },
          { id: 2, label: 'SQLite' },
        ],
      },
    };
    expect(output.followUpQuestion.questionId).toBe('q-2');
  });

  it('supports research-only resolution without a follow-up question', () => {
    const output: ClarificationFollowUpOutput = {
      researchOutcome: 'resolved-with-research',
      researchSummary: 'The current spec already requires PostgreSQL.',
    };
    expect(output.researchOutcome).toBe('resolved-with-research');
  });
});

describe('NumberedQuestionItem', () => {
  it('conforms to app-builder extended question shape', () => {
    const item: NumberedQuestionItem = {
      questionId: 'q-1',
      kind: 'issue-resolution',
      prompt: 'Clarify scope',
      options: [
        { id: 1, label: 'Option A', description: 'Pros: X. Cons: Y.' },
        { id: 2, label: 'Option B', description: 'Pros: A. Cons: B.' },
      ],
    };
    expect(item.kind).toBe('issue-resolution');
    expect(item.options).toHaveLength(2);
  });

  it('supports completion-confirmation kind', () => {
    const item: NumberedQuestionItem = {
      questionId: 'q-done',
      kind: 'completion-confirmation',
      prompt: 'Is the spec ready?',
      options: [
        { id: 1, label: 'Yes, spec is done' },
        { id: 2, label: 'No, need more work' },
      ],
    };
    expect(item.kind).toBe('completion-confirmation');
  });
});

describe('QuestionQueueItem', () => {
  it('extends NumberedQuestionItem with answered flag', () => {
    const item: QuestionQueueItem = {
      questionId: 'q-1',
      kind: 'issue-resolution',
      prompt: 'Clarify scope',
      options: [
        { id: 1, label: 'Option A' },
        { id: 2, label: 'Option B' },
      ],
      answered: false,
    };
    expect(item.answered).toBe(false);
  });
});
