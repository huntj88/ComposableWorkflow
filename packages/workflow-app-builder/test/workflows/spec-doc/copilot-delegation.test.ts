import { describe, expect, it, vi } from 'vitest';

import {
  delegateToCopilot,
  buildDelegationRequest,
  type CopilotDelegationRequest,
} from '../../../src/workflows/spec-doc/copilot-delegation.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';
import {
  COPILOT_APP_BUILDER_WORKFLOW_TYPE,
  type CopilotAppBuilderInput,
  type CopilotAppBuilderOutput,
} from '../../../src/workflows/copilot-prompt.js';
import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';
import type { CopilotPromptOptions } from '../../../src/workflows/spec-doc/contracts.js';

// ---------------------------------------------------------------------------
// Mock WorkflowContext factory
// ---------------------------------------------------------------------------

interface MockContextOptions {
  childOutput?: Partial<CopilotAppBuilderOutput>;
}

function createMockContext(opts: MockContextOptions = {}): {
  ctx: WorkflowContext<unknown, unknown>;
  launchChildSpy: ReturnType<typeof vi.fn>;
  logSpy: ReturnType<typeof vi.fn>;
} {
  const defaultChildOutput: CopilotAppBuilderOutput = {
    status: 'completed',
    prompt: 'test prompt',
    exitCode: 0,
    stdout: 'raw output',
    stderr: '',
    sessionId: 'session-123',
    structuredOutputRaw:
      '{"specPath":"specs/out.md","changeSummary":[],"resolvedQuestionIds":[],"remainingQuestionIds":[]}',
    structuredOutput: {
      specPath: 'specs/out.md',
      changeSummary: [],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    },
    ...opts.childOutput,
  };

  const launchChildSpy = vi.fn().mockResolvedValue(defaultChildOutput);
  const logSpy = vi.fn();

  const ctx: WorkflowContext<unknown, unknown> = {
    runId: 'run-001',
    workflowType: 'app-builder.spec-doc.v1',
    input: {},
    now: () => new Date('2026-03-02T12:00:00Z'),
    log: logSpy,
    transition: vi.fn(),
    launchChild: launchChildSpy,
    runCommand: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };

  return { ctx, launchChildSpy, logSpy };
}

// ---------------------------------------------------------------------------
// buildDelegationRequest
// ---------------------------------------------------------------------------

describe('buildDelegationRequest', () => {
  it('builds request from template, inheriting outputSchemaId and inputSchemaId', () => {
    const req = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      { request: 'Build app', source: 'workflow-input' },
      'IntegrateIntoSpec',
    );

    expect(req.templateId).toBe(TEMPLATE_IDS.integrate);
    expect(req.outputSchemaId).toBe(SCHEMA_IDS.specIntegrationOutput);
    expect(req.inputSchemaId).toBe(SCHEMA_IDS.specIntegrationInput);
    expect(req.state).toBe('IntegrateIntoSpec');
    expect(req.variables.request).toBe('Build app');
  });

  it('inherits undefined inputSchemaId for templates without it', () => {
    const req = buildDelegationRequest(
      TEMPLATE_IDS.consistencyCheck,
      { request: 'Check spec' },
      'LogicalConsistencyCheck',
    );

    expect(req.inputSchemaId).toBeUndefined();
  });

  it('forwards copilotPromptOptions when provided', () => {
    const opts: CopilotPromptOptions = {
      baseArgs: ['--model', 'gpt-5.3'],
      timeoutMs: 60000,
      cwd: '/workspace',
    };

    const req = buildDelegationRequest(
      TEMPLATE_IDS.classifyCustomPrompt,
      { customText: 'What about X?' },
      'ClassifyCustomPrompt',
      opts,
    );

    expect(req.copilotPromptOptions).toBe(opts);
  });
});

// ---------------------------------------------------------------------------
// SD-Prompt-003: OutputSchemaAlwaysProvided
// ---------------------------------------------------------------------------

describe('delegateToCopilot - outputSchema enforcement', () => {
  it('rejects delegation when outputSchemaId is missing', async () => {
    const { ctx } = createMockContext();

    const request: CopilotDelegationRequest = {
      templateId: TEMPLATE_IDS.integrate,
      outputSchemaId: '' as never,
      variables: { request: 'test' },
      state: 'IntegrateIntoSpec',
    };

    await expect(delegateToCopilot(ctx, request)).rejects.toThrow('requires outputSchemaId');
  });
});

// ---------------------------------------------------------------------------
// SD-Prompt-002: DelegationOnly (calls through shared helper)
// ---------------------------------------------------------------------------

describe('delegateToCopilot - child workflow invocation', () => {
  it('launches app-builder.copilot.prompt.v1 child with correct workflowType', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build a TODO app',
        source: 'workflow-input',
        targetPath: 'specs/todo.md',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    await delegateToCopilot(ctx, request);

    expect(launchChildSpy).toHaveBeenCalledTimes(1);
    const childReq = launchChildSpy.mock.calls[0][0];
    expect(childReq.workflowType).toBe(COPILOT_APP_BUILDER_WORKFLOW_TYPE);
  });

  it('includes interpolated prompt text in child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build a TODO app',
        source: 'workflow-input',
        targetPath: 'specs/todo.md',
        constraintsJson: '["React"]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.prompt).toContain('Build a TODO app');
    expect(childInput.prompt).toContain('workflow-input');
    expect(childInput.prompt).toContain('["React"]');
  });

  it('provides outputSchema as stringified JSON in child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.consistencyCheck,
      {
        request: 'Check',
        specPath: 'specs/todo.md',
        constraintsJson: '[]',
        loopCount: '1',
        remainingQuestionIdsJson: '[]',
      },
      'LogicalConsistencyCheck',
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.outputSchema).toBeDefined();
    // Should be valid JSON representing the schema
    const parsed = JSON.parse(childInput.outputSchema!);
    expect(parsed).toHaveProperty('$id');
  });

  it('sets correlationId with state and templateId', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.classifyCustomPrompt,
      {
        questionId: 'q-1',
        questionPrompt: 'Pick one',
        selectedOptionIdsJson: '[1]',
        customText: 'What about option 3?',
      },
      'ClassifyCustomPrompt',
    );

    await delegateToCopilot(ctx, request);

    const childReq = launchChildSpy.mock.calls[0][0];
    expect(childReq.correlationId).toBe(
      `ClassifyCustomPrompt:${TEMPLATE_IDS.classifyCustomPrompt}`,
    );
  });
});

// ---------------------------------------------------------------------------
// SD-Prompt-006: CopilotPromptOptionsPassThrough
// ---------------------------------------------------------------------------

describe('delegateToCopilot - copilotPromptOptions forwarding', () => {
  it('forwards baseArgs to child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
      { baseArgs: ['--model', 'gpt-5.3', '--silent'] },
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toEqual(['--model', 'gpt-5.3', '--silent']);
  });

  it('forwards allowedDirs to child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
      { allowedDirs: ['/workspace/a', '/workspace/b'] },
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.allowedDirs).toEqual(['/workspace/a', '/workspace/b']);
  });

  it('forwards timeoutMs to child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
      { timeoutMs: 45000 },
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.timeoutMs).toBe(45000);
  });

  it('forwards cwd to child input', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
      { cwd: '/my/workspace' },
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.cwd).toBe('/my/workspace');
  });

  it('forwards all copilotPromptOptions together', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const opts: CopilotPromptOptions = {
      baseArgs: ['--no-color'],
      allowedDirs: ['/a'],
      timeoutMs: 30000,
      cwd: '/b',
    };

    const request = buildDelegationRequest(
      TEMPLATE_IDS.expandClarification,
      {
        sourceQuestionId: 'q-1',
        sourceQuestionPrompt: 'Pick one',
        sourceOptionsJson: '[]',
        clarifyingQuestionText: 'What about X?',
      },
      'ExpandQuestionWithClarification',
      opts,
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toEqual(['--no-color']);
    expect(childInput.allowedDirs).toEqual(['/a']);
    expect(childInput.timeoutMs).toBe(30000);
    expect(childInput.cwd).toBe('/b');
  });

  it('omits copilotPromptOptions fields when not provided', async () => {
    const { ctx, launchChildSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    await delegateToCopilot(ctx, request);

    const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
    expect(childInput.baseArgs).toBeUndefined();
    expect(childInput.allowedDirs).toBeUndefined();
    expect(childInput.timeoutMs).toBeUndefined();
    expect(childInput.cwd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SD-Prompt-004: StructuredOutputBranching
// ---------------------------------------------------------------------------

describe('delegateToCopilot - structuredOutput validation', () => {
  it('returns structuredOutput when child provides it', async () => {
    const expectedOutput = {
      specPath: 'specs/out.md',
      changeSummary: ['Added scope section'],
      resolvedQuestionIds: [],
      remainingQuestionIds: [],
    };

    const { ctx } = createMockContext({
      childOutput: { structuredOutput: expectedOutput },
    });

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    const result = await delegateToCopilot(ctx, request);
    expect(result.structuredOutput).toEqual(expectedOutput);
    expect(result.templateId).toBe(TEMPLATE_IDS.integrate);
  });

  it('throws when child returns null structuredOutput', async () => {
    const { ctx } = createMockContext({
      childOutput: { structuredOutput: null },
    });

    const request = buildDelegationRequest(
      TEMPLATE_IDS.consistencyCheck,
      {
        request: 'Check',
        specPath: 'specs/todo.md',
        constraintsJson: '[]',
        loopCount: '1',
        remainingQuestionIdsJson: '[]',
      },
      'LogicalConsistencyCheck',
    );

    await expect(delegateToCopilot(ctx, request)).rejects.toThrow(
      'did not return structuredOutput',
    );
  });

  it('throws when child returns undefined structuredOutput', async () => {
    const { ctx } = createMockContext({
      childOutput: { structuredOutput: undefined, structuredOutputRaw: undefined },
    });

    const request = buildDelegationRequest(
      TEMPLATE_IDS.classifyCustomPrompt,
      {
        questionId: 'q-1',
        questionPrompt: 'Pick',
        selectedOptionIdsJson: '[]',
        customText: 'What?',
      },
      'ClassifyCustomPrompt',
    );

    await expect(delegateToCopilot(ctx, request)).rejects.toThrow(
      'did not return structuredOutput',
    );
  });

  it('includes structuredOutputRaw in result when available', async () => {
    const raw = '{"specPath":"specs/out.md"}';
    const { ctx } = createMockContext({
      childOutput: {
        structuredOutputRaw: raw,
        structuredOutput: { specPath: 'specs/out.md' },
      },
    });

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    const result = await delegateToCopilot(ctx, request);
    expect(result.structuredOutputRaw).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// SD-Prompt-005: InputSchemaSupport
// ---------------------------------------------------------------------------

describe('delegateToCopilot - inputSchema support', () => {
  it('includes inputSchemaId in log payload when template defines it', async () => {
    const { ctx, logSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.integrate,
      {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      'IntegrateIntoSpec',
    );

    await delegateToCopilot(ctx, request);

    const logCall = logSpy.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { payload?: { inputSchemaId?: string } }).payload?.inputSchemaId !== undefined,
    );
    expect(logCall).toBeDefined();
    expect((logCall![0] as { payload: { inputSchemaId: string } }).payload.inputSchemaId).toBe(
      SCHEMA_IDS.specIntegrationInput,
    );
  });

  it('omits inputSchemaId from log payload when template does not define it', async () => {
    const { ctx, logSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.consistencyCheck,
      {
        request: 'Check',
        specPath: 'specs/todo.md',
        constraintsJson: '[]',
        loopCount: '1',
        remainingQuestionIdsJson: '[]',
      },
      'LogicalConsistencyCheck',
    );

    await delegateToCopilot(ctx, request);

    const logPayload = (logSpy.mock.calls[0][0] as { payload: Record<string, unknown> }).payload;
    expect(logPayload).not.toHaveProperty('inputSchemaId');
  });
});

// ---------------------------------------------------------------------------
// Observability: logging
// ---------------------------------------------------------------------------

describe('delegateToCopilot - observability logging', () => {
  it('logs delegation with templateId and state metadata', async () => {
    const { ctx, logSpy } = createMockContext();

    const request = buildDelegationRequest(
      TEMPLATE_IDS.expandClarification,
      {
        sourceQuestionId: 'q-1',
        sourceQuestionPrompt: 'Pick one',
        sourceOptionsJson: '[]',
        clarifyingQuestionText: 'Can you clarify?',
      },
      'ExpandQuestionWithClarification',
    );

    await delegateToCopilot(ctx, request);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: expect.stringContaining(TEMPLATE_IDS.expandClarification),
        payload: expect.objectContaining({
          templateId: TEMPLATE_IDS.expandClarification,
          state: 'ExpandQuestionWithClarification',
          outputSchemaId: SCHEMA_IDS.clarificationFollowUpOutput,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// All four templates delegatable end-to-end
// ---------------------------------------------------------------------------

describe('delegateToCopilot - all four templates', () => {
  const templateTestCases: Array<{
    label: string;
    templateId: (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];
    variables: Record<string, string>;
    state: string;
  }> = [
    {
      label: 'IntegrateIntoSpec',
      templateId: TEMPLATE_IDS.integrate,
      variables: {
        request: 'Build app',
        source: 'workflow-input',
        targetPath: '',
        constraintsJson: '[]',
        specPath: '',
        answersJson: '[]',
      },
      state: 'IntegrateIntoSpec',
    },
    {
      label: 'LogicalConsistencyCheck',
      templateId: TEMPLATE_IDS.consistencyCheck,
      variables: {
        request: 'Check spec',
        specPath: 'specs/todo.md',
        constraintsJson: '[]',
        loopCount: '1',
        remainingQuestionIdsJson: '[]',
      },
      state: 'LogicalConsistencyCheck',
    },
    {
      label: 'ClassifyCustomPrompt',
      templateId: TEMPLATE_IDS.classifyCustomPrompt,
      variables: {
        questionId: 'q-1',
        questionPrompt: 'Pick one',
        selectedOptionIdsJson: '[1]',
        customText: 'What about option 3?',
      },
      state: 'ClassifyCustomPrompt',
    },
    {
      label: 'ExpandQuestionWithClarification',
      templateId: TEMPLATE_IDS.expandClarification,
      variables: {
        sourceQuestionId: 'q-1',
        sourceQuestionPrompt: 'Pick one',
        sourceOptionsJson: '[]',
        clarifyingQuestionText: 'Clarify please',
      },
      state: 'ExpandQuestionWithClarification',
    },
  ];

  for (const tc of templateTestCases) {
    it(`successfully delegates for ${tc.label}`, async () => {
      const { ctx, launchChildSpy } = createMockContext();

      const request = buildDelegationRequest(tc.templateId, tc.variables, tc.state);

      const result = await delegateToCopilot(ctx, request);

      expect(launchChildSpy).toHaveBeenCalledTimes(1);
      expect(result.templateId).toBe(tc.templateId);
      expect(result.structuredOutput).toBeDefined();

      // All delegations must include outputSchema
      const childInput: CopilotAppBuilderInput = launchChildSpy.mock.calls[0][0].input;
      expect(childInput.outputSchema).toBeDefined();
      expect(childInput.outputSchema!.length).toBeGreaterThan(0);
    });
  }
});
