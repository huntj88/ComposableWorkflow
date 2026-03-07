import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  BlockingIssue,
  ConsistencyCheckOutput,
  ConsistencyFollowUpChildInput,
  NumberedQuestionItem,
  NumberedQuestionOption,
  ReadinessChecklist,
  SpecActionableItem,
} from '../../../src/workflows/spec-doc/contracts.js';
import {
  CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  createConsistencyFollowUpChildDefinition,
  executeConsistencyFollowUpPromptLayers,
  handleConsistencyFollowUpChild,
  validateConsistencyCheckOutputContract,
} from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import { SCHEMA_IDS } from '../../../src/workflows/spec-doc/schemas.js';
import type { CopilotAppBuilderOutput } from '../../../src/workflows/copilot-prompt.js';

function readinessChecklist(overrides?: Partial<ReadinessChecklist>): ReadinessChecklist {
  return {
    hasScopeAndObjective: true,
    hasNonGoals: true,
    hasConstraintsAndAssumptions: true,
    hasInterfacesOrContracts: true,
    hasTestableAcceptanceCriteria: true,
    hasNoContradictions: true,
    hasSufficientDetail: true,
    ...overrides,
  };
}

function blockingIssue(overrides?: Partial<BlockingIssue>): BlockingIssue {
  return {
    id: 'issue-1',
    description: 'Missing deployment strategy',
    severity: 'high',
    ...overrides,
  };
}

function option(id: number, label: string): NumberedQuestionOption {
  return {
    id,
    label,
    description: `${label}. Pros: benefit. Cons: drawback.`,
  };
}

function followUpQuestion(
  questionId: string,
  overrides?: Partial<NumberedQuestionItem>,
): NumberedQuestionItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve ${questionId}`,
    options: [option(1, 'A'), option(2, 'B')],
    ...overrides,
  };
}

function actionableItem(overrides?: Partial<SpecActionableItem>): SpecActionableItem {
  return {
    itemId: 'act-1',
    instruction: 'Add a deployment section.',
    rationale: 'The draft does not explain rollout expectations.',
    blockingIssueIds: ['issue-1'],
    ...overrides,
  };
}

function stageOutput(overrides?: Partial<ConsistencyCheckOutput>): ConsistencyCheckOutput {
  return {
    blockingIssues: [blockingIssue()],
    actionableItems: [],
    followUpQuestions: [followUpQuestion('q-1')],
    readinessChecklist: readinessChecklist(),
    ...overrides,
  };
}

function narrowStageOutput(
  checklistKeys: readonly (keyof ReadinessChecklist)[],
  overrides?: Partial<ConsistencyCheckOutput>,
): Record<string, unknown> {
  const output = stageOutput(overrides);
  return {
    ...output,
    readinessChecklist: Object.fromEntries(
      checklistKeys.map((key) => [key, output.readinessChecklist[key]]),
    ),
  };
}

function createChildContext(responses: Array<unknown | Error>) {
  const launchChildSpy = vi.fn().mockImplementation(async () => {
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }

    const output = next ?? stageOutput();
    const childOutput: CopilotAppBuilderOutput = {
      status: 'completed',
      prompt: 'prompt',
      exitCode: 0,
      stdout: '',
      stderr: '',
      sessionId: 'session-1',
      structuredOutputRaw: JSON.stringify(output),
      structuredOutput: output,
    };
    return childOutput;
  });
  const completeSpy = vi.fn();
  const failSpy = vi.fn();
  const logSpy = vi.fn();

  const ctx = {
    runId: 'child-run-001',
    workflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    input: {
      request: 'Build a TODO app',
      specPath: 'specs/todo.md',
      constraints: ['React'],
      loopCount: 3,
      remainingQuestionIds: ['q-old-1'],
    },
    now: () => new Date('2026-03-06T12:00:00Z'),
    log: logSpy,
    transition: vi.fn(),
    launchChild: launchChildSpy,
    runCommand: vi.fn(),
    complete: completeSpy,
    fail: failSpy,
  } as unknown as WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>;

  return { ctx, launchChildSpy, completeSpy, failSpy, logSpy };
}

describe('validateConsistencyCheckOutputContract', () => {
  it('rejects mixed actionable and follow-up output', () => {
    const violations = validateConsistencyCheckOutputContract(
      stageOutput({
        actionableItems: [actionableItem()],
        followUpQuestions: [followUpQuestion('q-1')],
      }),
    );

    expect(violations).toContain(
      'actionableItems and followUpQuestions must be mutually exclusive',
    );
  });
});

describe('executeConsistencyFollowUpPromptLayers', () => {
  it('declares explicit child FSM states and transitions', () => {
    const definition = createConsistencyFollowUpChildDefinition();

    expect(definition.initialState).toBe(CONSISTENCY_FOLLOW_UP_CHILD_START_STATE);
    expect(Object.keys(definition.states)).toEqual([
      CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
    ]);
    expect(definition.transitions).toEqual([
      {
        from: CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
        to: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        name: 'initialized',
      },
      {
        from: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        to: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        name: 'more-stages-remain',
      },
      {
        from: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        to: CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
        name: 'child-run-complete',
      },
    ]);
  });

  it('executes prompt layers in order and forwards stage metadata', async () => {
    const { ctx, launchChildSpy } = createChildContext([
      narrowStageOutput(['hasScopeAndObjective'], {
        followUpQuestions: [followUpQuestion('q-1')],
        blockingIssues: [],
      }),
      narrowStageOutput(['hasInterfacesOrContracts'], {
        blockingIssues: [blockingIssue({ id: 'issue-2' })],
        followUpQuestions: [followUpQuestion('q-2')],
      }),
    ]);

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
      {
        stageId: 'scope-objective-consistency',
        templateId: TEMPLATE_IDS.consistencyScopeObjective,
        outputSchema: SCHEMA_IDS.consistencyScopeObjectiveOutput,
        checklistKeys: ['hasScopeAndObjective'],
      },
      {
        stageId: 'interfaces-contracts-consistency',
        templateId: TEMPLATE_IDS.consistencyInterfacesContracts,
        outputSchema: SCHEMA_IDS.consistencyInterfacesContractsOutput,
        checklistKeys: ['hasInterfacesOrContracts'],
      },
    ]);

    expect(launchChildSpy).toHaveBeenCalledTimes(2);
    expect(launchChildSpy.mock.calls[0][0].workflowType).toBe('app-builder.copilot.prompt.v1');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'Stage focus: scope and objective clarity',
    );
    expect(launchChildSpy.mock.calls[1][0].input.prompt).toContain(
      'Stage focus: interfaces and contracts',
    );
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain('currentLoopCount: 3');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'remainingQuestionIdsFromIntegration: ["q-old-1"]',
    );
    expect(JSON.parse(launchChildSpy.mock.calls[0][0].input.outputSchema).$id).toBe(
      SCHEMA_IDS.consistencyScopeObjectiveOutput,
    );
    expect(JSON.parse(launchChildSpy.mock.calls[1][0].input.outputSchema).$id).toBe(
      SCHEMA_IDS.consistencyInterfacesContractsOutput,
    );
    expect(result.followUpQuestions.map((question) => question.questionId)).toEqual(['q-1', 'q-2']);
  });

  it('short-circuits later stages after actionableItems and aggregates executed-stage diagnostics', async () => {
    const { ctx, launchChildSpy } = createChildContext([
      narrowStageOutput(['hasInterfacesOrContracts'], {
        blockingIssues: [blockingIssue({ id: 'issue-1' })],
        followUpQuestions: [],
        readinessChecklist: readinessChecklist({ hasInterfacesOrContracts: false }),
      }),
      narrowStageOutput(['hasNoContradictions', 'hasSufficientDetail'], {
        blockingIssues: [blockingIssue({ id: 'issue-1' }), blockingIssue({ id: 'issue-2' })],
        actionableItems: [actionableItem()],
        followUpQuestions: [],
        readinessChecklist: readinessChecklist({ hasNoContradictions: false }),
      }),
    ]);

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
      {
        stageId: 'interfaces-contracts-consistency',
        templateId: TEMPLATE_IDS.consistencyInterfacesContracts,
        outputSchema: SCHEMA_IDS.consistencyInterfacesContractsOutput,
        checklistKeys: ['hasInterfacesOrContracts'],
      },
      {
        stageId: 'contradictions-completeness-consistency',
        templateId: TEMPLATE_IDS.consistencyContradictionsCompleteness,
        outputSchema: SCHEMA_IDS.consistencyContradictionsCompletenessOutput,
        checklistKeys: ['hasNoContradictions', 'hasSufficientDetail'],
      },
      {
        stageId: 'should-not-run',
        templateId: TEMPLATE_IDS.consistencyAcceptanceCriteria,
        outputSchema: SCHEMA_IDS.consistencyAcceptanceCriteriaOutput,
        checklistKeys: ['hasTestableAcceptanceCriteria'],
      },
    ]);

    expect(launchChildSpy).toHaveBeenCalledTimes(2);
    expect(result.actionableItems).toHaveLength(1);
    expect(result.followUpQuestions).toEqual([]);
    expect(result.blockingIssues.map((issue) => issue.id)).toEqual(['issue-1', 'issue-2']);
    expect(result.readinessChecklist.hasInterfacesOrContracts).toBe(false);
    expect(result.readinessChecklist.hasNoContradictions).toBe(false);
  });

  it('fails on duplicate questionId values across executed stages', async () => {
    const { ctx } = createChildContext([
      narrowStageOutput(['hasScopeAndObjective'], {
        followUpQuestions: [followUpQuestion('q-1')],
      }),
      narrowStageOutput(['hasNonGoals'], {
        followUpQuestions: [followUpQuestion('q-1')],
      }),
    ]);

    await expect(
      executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
        {
          stageId: 'stage-1',
          templateId: TEMPLATE_IDS.consistencyScopeObjective,
          outputSchema: SCHEMA_IDS.consistencyScopeObjectiveOutput,
          checklistKeys: ['hasScopeAndObjective'],
        },
        {
          stageId: 'stage-2',
          templateId: TEMPLATE_IDS.consistencyNonGoals,
          outputSchema: SCHEMA_IDS.consistencyNonGoalsOutput,
          checklistKeys: ['hasNonGoals'],
        },
      ]),
    ).rejects.toThrow('duplicate follow-up questionId: q-1');
  });

  it('fails when actionableItems appear after prior follow-up questions', async () => {
    const { ctx } = createChildContext([
      narrowStageOutput(['hasScopeAndObjective'], {
        followUpQuestions: [followUpQuestion('q-1')],
        actionableItems: [],
      }),
      narrowStageOutput(['hasInterfacesOrContracts'], {
        actionableItems: [actionableItem()],
        followUpQuestions: [],
      }),
    ]);

    await expect(
      executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
        {
          stageId: 'stage-1',
          templateId: TEMPLATE_IDS.consistencyScopeObjective,
          outputSchema: SCHEMA_IDS.consistencyScopeObjectiveOutput,
          checklistKeys: ['hasScopeAndObjective'],
        },
        {
          stageId: 'stage-2',
          templateId: TEMPLATE_IDS.consistencyInterfacesContracts,
          outputSchema: SCHEMA_IDS.consistencyInterfacesContractsOutput,
          checklistKeys: ['hasInterfacesOrContracts'],
        },
      ]),
    ).rejects.toThrow('actionableItems cannot appear after followUpQuestions');
  });

  it('uses the fine-grained default validation layer list', async () => {
    const { ctx, launchChildSpy } = createChildContext([
      narrowStageOutput(['hasScopeAndObjective'], { followUpQuestions: [], blockingIssues: [] }),
      narrowStageOutput(['hasNonGoals'], { followUpQuestions: [], blockingIssues: [] }),
      narrowStageOutput(['hasConstraintsAndAssumptions'], {
        followUpQuestions: [],
        blockingIssues: [],
      }),
      narrowStageOutput(['hasInterfacesOrContracts'], {
        followUpQuestions: [],
        blockingIssues: [],
      }),
      narrowStageOutput(['hasTestableAcceptanceCriteria'], {
        followUpQuestions: [],
        blockingIssues: [],
      }),
      narrowStageOutput(['hasNoContradictions', 'hasSufficientDetail'], {
        followUpQuestions: [],
        blockingIssues: [],
      }),
    ]);

    await executeConsistencyFollowUpPromptLayers(ctx, ctx.input);

    expect(launchChildSpy).toHaveBeenCalledTimes(6);
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'Stage focus: scope and objective clarity',
    );
    expect(launchChildSpy.mock.calls[5][0].input.prompt).toContain(
      'Stage focus: contradictions and implementation completeness',
    );
  });
});

describe('handleConsistencyFollowUpChild', () => {
  it('completes with the aggregated child result', async () => {
    const { ctx, completeSpy, failSpy } = createChildContext([
      narrowStageOutput(['hasScopeAndObjective'], {
        blockingIssues: [blockingIssue({ id: 'issue-1' })],
        actionableItems: [actionableItem()],
        followUpQuestions: [],
      }),
    ]);

    await handleConsistencyFollowUpChild(ctx);

    expect(failSpy).not.toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionableItems: [actionableItem()],
        followUpQuestions: [],
      }),
    );
  });

  it('fails on invalid child input', async () => {
    const { ctx, failSpy, completeSpy } = createChildContext([stageOutput()]);
    ctx.input = {
      ...ctx.input,
      specPath: '',
    };

    await handleConsistencyFollowUpChild(ctx);

    expect(completeSpy).not.toHaveBeenCalled();
    expect(failSpy).toHaveBeenCalledTimes(1);
  });
});
