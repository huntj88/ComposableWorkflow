import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  CopilotPromptOptions,
  NormalizedAnswer,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
  SpecIntegrationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import type { CopilotAppBuilderOutput } from '../../../src/workflows/copilot-prompt.js';
import {
  handleIntegrateIntoSpec,
  INTEGRATE_INTO_SPEC_STATE,
} from '../../../src/workflows/spec-doc/states/integrate-into-spec.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';
import {
  type SpecDocStateData,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function validIntegrationOutput(overrides?: Partial<SpecIntegrationOutput>): SpecIntegrationOutput {
  return {
    specPath: 'specs/todo.md',
    changeSummary: ['Added scope section'],
    resolvedQuestionIds: [],
    remainingQuestionIds: ['q-open-1'],
    ...overrides,
  };
}

interface MockCtxOptions {
  input?: Partial<SpecDocGenerationInput>;
  childOutput?: Partial<CopilotAppBuilderOutput>;
  childThrows?: Error;
}

function createMockContext(opts: MockCtxOptions = {}) {
  const output = validIntegrationOutput();

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

function makeAnswers(count: number): NormalizedAnswer[] {
  return Array.from({ length: count }, (_, i) => ({
    questionId: `q-${i + 1}`,
    selectedOptionIds: [1],
    answeredAt: '2026-03-02T12:00:00.000Z',
  }));
}

function stateDataWithAnswers(
  answers: NormalizedAnswer[],
  specPath = 'specs/todo.md',
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    normalizedAnswers: answers,
    artifacts: { specPath },
  };
}

// ---------------------------------------------------------------------------
// SD-INT-001-FirstPassSource
// ---------------------------------------------------------------------------

describe('SD-INT-001-FirstPassSource', () => {
  it('first execution emits source: workflow-input with base request fields', async () => {
    const { ctx, launchChildSpy, transitionSpy } = createMockContext();
    const stateData = createInitialStateData();

    await handleIntegrateIntoSpec(ctx, stateData);

    // launchChild was called with proper prompt containing source: workflow-input
    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('workflow-input');
    expect(childInput.prompt).toContain('Build a TODO app');
    expect(childInput.prompt).toContain('specs/todo.md');

    // Transitioned to next state
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith(
      'LogicalConsistencyCheckCreateFollowUpQuestions',
      expect.any(Object),
    );
  });

  it('first pass carries constraints as JSON in prompt', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('Must use React');
    expect(childInput.prompt).toContain('Must support offline');
  });

  it('first pass uses empty answers', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const childInput = launchChildSpy.mock.calls[0][0].input;
    // answers should be empty array for first pass
    expect(childInput.prompt).toContain('answers: []');
  });

  it('works when data parameter is undefined (defaults to initial state)', async () => {
    const { ctx, transitionSpy, launchChildSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, undefined);

    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('workflow-input');
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SD-INT-002-FeedbackPassSource
// ---------------------------------------------------------------------------

describe('SD-INT-002-FeedbackPassSource', () => {
  it('re-entry uses source: numbered-options-feedback with normalized answers', async () => {
    const answers = makeAnswers(2);
    const stateData = stateDataWithAnswers(answers);
    const { ctx, launchChildSpy, transitionSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, stateData);

    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('numbered-options-feedback');
    expect(childInput.prompt).toContain('q-1');
    expect(childInput.prompt).toContain('q-2');

    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('feedback pass references prior specPath', async () => {
    const answers = makeAnswers(1);
    const stateData = stateDataWithAnswers(answers, 'specs/prior-draft.md');
    const { ctx, launchChildSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, stateData);

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('specs/prior-draft.md');
  });
});

// ---------------------------------------------------------------------------
// SD-INT-003-SpecPathCarryForward
// ---------------------------------------------------------------------------

describe('SD-INT-003-SpecPathCarryForward', () => {
  it('subsequent passes receive prior specPath in persisted state', async () => {
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: validIntegrationOutput({ specPath: 'specs/v2.md' }),
        structuredOutputRaw: JSON.stringify(validIntegrationOutput({ specPath: 'specs/v2.md' })),
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.artifacts.specPath).toBe('specs/v2.md');
  });

  it('specPath must end with .md (validated by schema)', async () => {
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: { ...validIntegrationOutput(), specPath: 'specs/todo.txt' },
        structuredOutputRaw: JSON.stringify({
          ...validIntegrationOutput(),
          specPath: 'specs/todo.txt',
        }),
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('schema validation failed');
  });
});

// ---------------------------------------------------------------------------
// SD-INT-004-IntegrationSchemaGate
// ---------------------------------------------------------------------------

describe('SD-INT-004-IntegrationSchemaGate', () => {
  it('output must satisfy spec-integration-output.schema.json or fail terminally', async () => {
    const invalidOutput = {
      specPath: 'specs/todo.md',
      // missing changeSummary, resolvedQuestionIds, remainingQuestionIds
    };
    const { ctx, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: invalidOutput,
        structuredOutputRaw: JSON.stringify(invalidOutput),
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain(INTEGRATE_INTO_SPEC_STATE);
    expect(error.message).toContain('schema validation failed');
  });

  it('valid output does not trigger failure', async () => {
    const { ctx, failSpy, transitionSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('hard-fails on delegation error', async () => {
    const { ctx, failSpy } = createMockContext({
      childThrows: new Error('Copilot unavailable'),
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(failSpy).toHaveBeenCalledTimes(1);
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Copilot unavailable');
  });
});

// ---------------------------------------------------------------------------
// SD-INT-005-RemainingQuestionIdsPersistence
// ---------------------------------------------------------------------------

describe('SD-INT-005-RemainingQuestionIdsPersistence', () => {
  it('remainingQuestionIds from integration output are persisted for downstream consumption', async () => {
    const output = validIntegrationOutput({
      remainingQuestionIds: ['q-open-1', 'q-open-2'],
      resolvedQuestionIds: ['q-resolved-1'],
    });
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.artifacts.lastIntegrationOutput).toBeDefined();
    expect(transitionData.artifacts.lastIntegrationOutput!.remainingQuestionIds).toEqual([
      'q-open-1',
      'q-open-2',
    ]);
    expect(transitionData.artifacts.lastIntegrationOutput!.resolvedQuestionIds).toEqual([
      'q-resolved-1',
    ]);
  });
});

// ---------------------------------------------------------------------------
// SD-INT-006-InputSchemaProvided
// ---------------------------------------------------------------------------

describe('SD-INT-006-InputSchemaProvided', () => {
  it('delegation call includes inputSchema = spec-integration-input.schema.json', async () => {
    const { ctx, logSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    // The delegation helper logs inputSchemaId when the template defines it.
    // Since buildDelegationRequest inherits inputSchemaId from the integrate template,
    // verify via the log payload emitted by delegateToCopilot.
    const delegationLog = logSpy.mock.calls.find((call: unknown[]) => {
      const event = call[0] as { message?: string; payload?: { inputSchemaId?: string } };
      return event.message?.includes('Delegating to copilot prompt');
    });
    expect(delegationLog).toBeDefined();
    const payload = (delegationLog![0] as { payload: { inputSchemaId: string } }).payload;
    expect(payload.inputSchemaId).toBe(SCHEMA_IDS.specIntegrationInput);
  });
});

// ---------------------------------------------------------------------------
// Integration pass counter
// ---------------------------------------------------------------------------

describe('Integration pass counter', () => {
  it('increments integrationPasses on successful delegation', async () => {
    const { ctx, transitionSpy } = createMockContext();
    const stateData = createInitialStateData();
    expect(stateData.counters.integrationPasses).toBe(0);

    await handleIntegrateIntoSpec(ctx, stateData);

    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.counters.integrationPasses).toBe(1);
  });

  it('does not increment on schema validation failure', async () => {
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: {
        structuredOutput: { specPath: 'bad.txt' },
        structuredOutputRaw: '{"specPath":"bad.txt"}',
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
  });

  it('accumulates across multiple passes', async () => {
    const stateData = createInitialStateData();
    stateData.counters.integrationPasses = 2;
    stateData.normalizedAnswers = makeAnswers(1);
    stateData.artifacts.specPath = 'specs/todo.md';

    const { ctx, transitionSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, stateData);

    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.counters.integrationPasses).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// copilotPromptOptions forwarding
// ---------------------------------------------------------------------------

describe('copilotPromptOptions forwarding', () => {
  it('forwards copilotPromptOptions from workflow input to delegation', async () => {
    const opts: CopilotPromptOptions = {
      baseArgs: ['--model', 'gpt-5.3'],
      allowedDirs: ['/workspace'],
      timeoutMs: 60000,
      cwd: '/my/project',
    };
    const { ctx, launchChildSpy } = createMockContext({
      input: { copilotPromptOptions: opts },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const childInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toEqual(['--model', 'gpt-5.3']);
    expect(childInput.allowedDirs).toEqual(['/workspace']);
    expect(childInput.timeoutMs).toBe(60000);
    expect(childInput.cwd).toBe('/my/project');
  });
});

// ---------------------------------------------------------------------------
// Persisted output fields
// ---------------------------------------------------------------------------

describe('Persisted output fields', () => {
  it('persists specPath, changeSummary, resolvedQuestionIds, remainingQuestionIds', async () => {
    const output = validIntegrationOutput({
      specPath: 'specs/final.md',
      changeSummary: ['Added scope', 'Added constraints'],
      resolvedQuestionIds: ['q-1'],
      remainingQuestionIds: ['q-2', 'q-3'],
    });
    const { ctx, transitionSpy } = createMockContext({
      childOutput: {
        structuredOutput: output,
        structuredOutputRaw: JSON.stringify(output),
      },
    });

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.artifacts.specPath).toBe('specs/final.md');

    const lio = transitionData.artifacts.lastIntegrationOutput!;
    expect(lio.specPath).toBe('specs/final.md');
    expect(lio.changeSummary).toEqual(['Added scope', 'Added constraints']);
    expect(lio.resolvedQuestionIds).toEqual(['q-1']);
    expect(lio.remainingQuestionIds).toEqual(['q-2', 'q-3']);
  });
});

// ---------------------------------------------------------------------------
// Transition target
// ---------------------------------------------------------------------------

describe('Transition target', () => {
  it('always transitions to LogicalConsistencyCheckCreateFollowUpQuestions', async () => {
    const { ctx, transitionSpy } = createMockContext();

    await handleIntegrateIntoSpec(ctx, createInitialStateData());

    expect(transitionSpy).toHaveBeenCalledWith(
      'LogicalConsistencyCheckCreateFollowUpQuestions',
      expect.any(Object),
    );
  });
});
