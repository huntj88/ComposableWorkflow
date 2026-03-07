import { describe, expect, it, beforeAll } from 'vitest';

import {
  createSpecDocValidator,
  parseAndValidate,
  SCHEMA_IDS,
  type SpecDocValidator,
} from '../../../src/workflows/spec-doc/schema-validation.js';

import { Ajv2020 } from 'ajv/dist/2020.js';

import {
  getAllSchemaIds,
  loadSchemaById,
  loadAllSchemas,
  bundleSchemaForExport,
} from '../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// Schema Registry Tests
// ---------------------------------------------------------------------------

describe('schema registry', () => {
  it('resolves all section 7.1 schema IDs', () => {
    const ids = getAllSchemaIds();
    // 7 app-builder schemas + 2 server-owned = 9 total
    expect(ids).toHaveLength(9);
  });

  it('loads every registered schema without error', () => {
    const schemas = loadAllSchemas();
    expect(schemas.size).toBe(9);
    for (const [, schema] of schemas) {
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('object');
      expect(schema.$id ?? schema.$schema).toBeDefined();
    }
  });

  it('loads individual schemas by ID', () => {
    const schema = loadSchemaById(SCHEMA_IDS.specIntegrationOutput);
    expect(schema.$id).toBe(SCHEMA_IDS.specIntegrationOutput);
    expect(schema.title).toBe('SpecIntegrationOutput');
  });
});

// ---------------------------------------------------------------------------
// Validator Creation
// ---------------------------------------------------------------------------

describe('createSpecDocValidator', () => {
  it('creates a validator with all schemas pre-loaded', () => {
    const validator = createSpecDocValidator();
    expect(validator).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Parse Failure Tests (B-SD-SCHEMA-002)
// ---------------------------------------------------------------------------

describe('parse failures', () => {
  let validator: SpecDocValidator;
  beforeAll(() => {
    validator = createSpecDocValidator();
  });

  it('returns parse-failure for non-JSON string', () => {
    const result = validator.validate('not json at all', SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse-failure');
      expect(result.error.schemaId).toBe(SCHEMA_IDS.specIntegrationOutput);
      expect(result.error.details).toBeTruthy();
    }
  });

  it('returns parse-failure for empty string', () => {
    const result = validator.validate('', SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse-failure');
    }
  });

  it('returns parse-failure for truncated JSON', () => {
    const result = validator.validate('{"specPath": "test.md"', SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse-failure');
    }
  });

  it('parse-failure includes schema identifier', () => {
    const schemaId = SCHEMA_IDS.consistencyCheckOutput;
    const result = validator.validate('{{invalid}}', schemaId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.schemaId).toBe(schemaId);
    }
  });
});

// ---------------------------------------------------------------------------
// Schema Validation Failure Tests (B-SD-SCHEMA-003)
// ---------------------------------------------------------------------------

describe('schema validation failures', () => {
  let validator: SpecDocValidator;
  beforeAll(() => {
    validator = createSpecDocValidator();
  });

  it('rejects valid JSON that does not match spec-integration-output schema', () => {
    const raw = JSON.stringify({ foo: 'bar' });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
      expect(result.error.schemaId).toBe(SCHEMA_IDS.specIntegrationOutput);
      expect(result.error.details).toBeTruthy();
    }
  });

  it('rejects valid JSON that does not match consistency-check-output schema', () => {
    const raw = JSON.stringify({ blockingIssues: 'not-an-array' });
    const result = validator.validate(raw, SCHEMA_IDS.consistencyCheckOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
      expect(result.error.schemaId).toBe(SCHEMA_IDS.consistencyCheckOutput);
    }
  });

  it('rejects valid JSON that does not match custom-prompt-classification-output schema', () => {
    const raw = JSON.stringify({ intent: 'unknown-intent' });
    const result = validator.validate(raw, SCHEMA_IDS.customPromptClassificationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });

  it('rejects spec-doc-generation-output with wrong status', () => {
    const raw = JSON.stringify({
      status: 'failed',
      specPath: 'test.md',
      summary: { unresolvedQuestions: 0 },
      artifacts: { integrationPasses: 1, consistencyCheckPasses: 1 },
    });
    const result = validator.validate(raw, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });

  it('rejects spec-doc-generation-output with non-zero unresolvedQuestions', () => {
    const raw = JSON.stringify({
      status: 'completed',
      specPath: 'test.md',
      summary: { unresolvedQuestions: 2 },
      artifacts: { integrationPasses: 1, consistencyCheckPasses: 1 },
    });
    const result = validator.validate(raw, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });

  it('rejects spec-integration-input with numbered-options-feedback and missing answers', () => {
    const raw = JSON.stringify({
      source: 'numbered-options-feedback',
      request: 'Build a TODO app',
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });

  it('rejects spec-integration-input with consistency-action-items and missing actionableItems', () => {
    const raw = JSON.stringify({
      source: 'consistency-action-items',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });

  it('validation error includes expected schema identifier', () => {
    const raw = JSON.stringify({});
    const result = validator.validate(raw, SCHEMA_IDS.clarificationFollowUpOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.schemaId).toBe(SCHEMA_IDS.clarificationFollowUpOutput);
    }
  });
});

// ---------------------------------------------------------------------------
// Successful Validation Tests
// ---------------------------------------------------------------------------

describe('successful schema validation', () => {
  let validator: SpecDocValidator;
  beforeAll(() => {
    validator = createSpecDocValidator();
  });

  it('validates valid spec-integration-output', () => {
    const raw = JSON.stringify({
      specPath: 'specs/todo.md',
      changeSummary: ['Added scope section'],
      resolvedQuestionIds: ['q-1'],
      remainingQuestionIds: [],
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as Record<string, unknown>).specPath).toBe('specs/todo.md');
    }
  });

  it('validates valid consistency-check-output with empty follow-ups', () => {
    const raw = JSON.stringify({
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
    });
    const result = validator.validate(raw, SCHEMA_IDS.consistencyCheckOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid consistency-check-output with follow-up questions', () => {
    const raw = JSON.stringify({
      blockingIssues: [{ id: 'issue-1', description: 'Missing scope', severity: 'high' }],
      actionableItems: [],
      followUpQuestions: [
        {
          questionId: 'q-1',
          kind: 'issue-resolution',
          prompt: 'What is the project scope?',
          options: [
            { id: 1, label: 'Web app', description: 'Pros: reach. Cons: complexity.' },
            { id: 2, label: 'CLI tool', description: 'Pros: simple. Cons: no UI.' },
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
    });
    const result = validator.validate(raw, SCHEMA_IDS.consistencyCheckOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid custom-prompt-classification-output (clarifying-question)', () => {
    const raw = JSON.stringify({
      intent: 'clarifying-question',
      customQuestionText: 'What database should we use?',
    });
    const result = validator.validate(raw, SCHEMA_IDS.customPromptClassificationOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid custom-prompt-classification-output (unrelated-question)', () => {
    const raw = JSON.stringify({
      intent: 'unrelated-question',
      customQuestionText: 'What existing auth implementation is already in the repo?',
    });
    const result = validator.validate(raw, SCHEMA_IDS.customPromptClassificationOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid custom-prompt-classification-output (custom-answer)', () => {
    const raw = JSON.stringify({
      intent: 'custom-answer',
      customAnswerText: 'Use PostgreSQL.',
    });
    const result = validator.validate(raw, SCHEMA_IDS.customPromptClassificationOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid clarification-follow-up-output', () => {
    const raw = JSON.stringify({
      researchOutcome: 'needs-follow-up-question',
      researchSummary: 'Research found a remaining database choice to make.',
      followUpQuestion: {
        questionId: 'q-2',
        prompt: 'Which database engine?',
        options: [
          { id: 1, label: 'PostgreSQL', description: 'Pros: Reliable. Cons: Heavier.' },
          { id: 2, label: 'SQLite', description: 'Pros: Simple. Cons: Limited scaling.' },
        ],
      },
    });
    const result = validator.validate(raw, SCHEMA_IDS.clarificationFollowUpOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid spec-doc-generation-output', () => {
    const raw = JSON.stringify({
      status: 'completed',
      specPath: 'specs/todo.md',
      summary: { unresolvedQuestions: 0 },
      artifacts: { integrationPasses: 3, consistencyCheckPasses: 2 },
    });
    const result = validator.validate(raw, SCHEMA_IDS.specDocGenerationOutput);
    expect(result.ok).toBe(true);
  });

  it('validates valid spec-integration-input (workflow-input)', () => {
    const raw = JSON.stringify({
      source: 'workflow-input',
      request: 'Build a TODO app',
      targetPath: 'specs/todo.md',
      constraints: ['React', 'TypeScript'],
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });

  it('validates valid spec-integration-input (numbered-options-feedback)', () => {
    const raw = JSON.stringify({
      source: 'numbered-options-feedback',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      answers: [
        {
          questionId: 'q-1',
          selectedOptionIds: [1],
          answeredAt: '2026-03-02T12:00:00Z',
        },
      ],
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });

  it('validates valid spec-integration-input (consistency-action-items)', () => {
    const raw = JSON.stringify({
      source: 'consistency-action-items',
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      actionableItems: [
        {
          itemId: 'act-1',
          instruction: 'Add explicit interface examples.',
          rationale: 'The draft leaves request and response shapes underspecified.',
          targetSection: 'Interfaces',
          blockingIssueIds: ['issue-interfaces'],
        },
      ],
    });
    const result = validator.validate(raw, SCHEMA_IDS.specIntegrationInput);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One-shot convenience function
// ---------------------------------------------------------------------------

describe('parseAndValidate', () => {
  it('works as a one-shot convenience', () => {
    const raw = JSON.stringify({
      specPath: 'specs/todo.md',
      changeSummary: ['Initial draft'],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    });
    const result = parseAndValidate(raw, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(true);
  });

  it('returns parse-failure for non-JSON', () => {
    const result = parseAndValidate('broken', SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse-failure');
    }
  });
});

// ---------------------------------------------------------------------------
// validateParsed (pre-parsed objects)
// ---------------------------------------------------------------------------

describe('validateParsed', () => {
  let validator: SpecDocValidator;
  beforeAll(() => {
    validator = createSpecDocValidator();
  });

  it('validates a pre-parsed object', () => {
    const value = {
      specPath: 'specs/todo.md',
      changeSummary: ['Added scope'],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    };
    const result = validator.validateParsed(value, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(true);
  });

  it('rejects an invalid pre-parsed object', () => {
    const result = validator.validateParsed({}, SCHEMA_IDS.specIntegrationOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema-validation');
    }
  });
});

// ---------------------------------------------------------------------------
// bundleSchemaForExport — standalone validation without external $ref
// ---------------------------------------------------------------------------

describe('bundleSchemaForExport', () => {
  it('produces a schema with no external $ref entries', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.clarificationFollowUpOutput);
    const json = JSON.stringify(bundled);
    // Internal (#/-prefixed) refs are fine; external refs should be inlined
    const refMatches = [...json.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)];
    for (const match of refMatches) {
      expect(match[1]).toMatch(/^#/);
    }
  });

  it('bundled clarificationFollowUpOutput validates with a standalone Ajv instance', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.clarificationFollowUpOutput);
    const ajv = new Ajv2020({ strict: false, allErrors: true, removeAdditional: true });
    const validate = ajv.compile(bundled);

    const valid = {
      researchOutcome: 'needs-follow-up-question',
      researchSummary: 'Research still needs a human choice.',
      followUpQuestion: {
        questionId: 'q-clarify-1',
        prompt: 'How should the widget handle offline mode?',
        options: [
          { id: 1, label: 'Queue locally', description: 'Pros: Resilient. Cons: Complexity.' },
          { id: 2, label: 'Show error', description: 'Pros: Simple. Cons: Bad UX.' },
        ],
      },
    };
    expect(validate(valid)).toBe(true);
  });

  it('bundled schema rejects invalid data with standalone Ajv', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.clarificationFollowUpOutput);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(bundled);

    // Missing required followUpQuestion
    expect(validate({})).toBe(false);
    // followUpQuestion missing required prompt
    expect(
      validate({
        researchOutcome: 'needs-follow-up-question',
        researchSummary: 'Need more input.',
        followUpQuestion: {
          questionId: 'q1',
          options: [
            { id: 1, label: 'A' },
            { id: 2, label: 'B' },
          ],
        },
      }),
    ).toBe(false);
  });

  it('standalone Ajv with removeAdditional strips extra properties from nested $ref targets', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.clarificationFollowUpOutput);
    const ajv = new Ajv2020({ strict: false, allErrors: true, removeAdditional: true });
    const validate = ajv.compile(bundled);

    const data = {
      researchOutcome: 'needs-follow-up-question',
      researchSummary: 'Need a human caching choice.',
      followUpQuestion: {
        questionId: 'q-clarify-1',
        prompt: 'How should caching work?',
        options: [
          { id: 1, label: 'Redis', description: 'Pros: Fast. Cons: Infra.' },
          { id: 2, label: 'In-memory', description: 'Pros: Simple. Cons: Lost on restart.' },
        ],
        extraFieldFromLLM: 'this should be stripped',
        anotherExtra: 42,
      },
    };

    expect(validate(data)).toBe(true);
    // Extra properties should have been removed by removeAdditional
    expect(data.followUpQuestion).not.toHaveProperty('extraFieldFromLLM');
    expect(data.followUpQuestion).not.toHaveProperty('anotherExtra');
    // Valid properties remain
    expect(data.followUpQuestion.questionId).toBe('q-clarify-1');
    expect(data.followUpQuestion.options).toHaveLength(2);
  });

  it('bundles consistencyCheckOutput with nested $ref through allOf', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.consistencyCheckOutput);
    const json = JSON.stringify(bundled);
    const refMatches = [...json.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)];
    for (const match of refMatches) {
      expect(match[1]).toMatch(/^#/);
    }

    // Verify it compiles and validates with standalone Ajv
    const ajv = new Ajv2020({ strict: false, allErrors: true, removeAdditional: true });
    const validate = ajv.compile(bundled);

    const valid = {
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
    expect(validate(valid)).toBe(true);
  });

  it('rejects mixed actionableItems and followUpQuestions', () => {
    const validator = createSpecDocValidator();
    const raw = JSON.stringify({
      blockingIssues: [],
      actionableItems: [
        {
          itemId: 'act-1',
          instruction: 'Add an interfaces section',
          rationale: 'The API contract is underspecified.',
          blockingIssueIds: ['issue-1'],
        },
      ],
      followUpQuestions: [
        {
          questionId: 'q-1',
          kind: 'issue-resolution',
          prompt: 'Which API format should be used?',
          options: [{ id: 1, label: 'REST', description: 'Pros: common. Cons: verbose.' }],
        },
      ],
      readinessChecklist: {
        hasScopeAndObjective: true,
        hasNonGoals: true,
        hasConstraintsAndAssumptions: true,
        hasInterfacesOrContracts: false,
        hasTestableAcceptanceCriteria: true,
        hasNoContradictions: true,
        hasSufficientDetail: false,
      },
    });

    const result = validator.validate(raw, SCHEMA_IDS.consistencyCheckOutput);
    expect(result.ok).toBe(false);
  });

  it('preserves internal #/ refs without inlining', () => {
    const bundled = bundleSchemaForExport(SCHEMA_IDS.specIntegrationInput);
    const json = JSON.stringify(bundled);
    // specIntegrationInput uses #/$defs/normalizedAnswer — should remain
    expect(json).toContain('#/$defs/normalizedAnswer');
  });
});
