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
  CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
  CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
  CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  createConsistencyFollowUpChildDefinition,
  executeConsistencyFollowUpPromptLayers,
  handleConsistencyFollowUpChild,
  validateConsistencyCheckOutputContract,
  validateConsistencyStageOutputContract,
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

function withPlanResolutionResponse(
  stageResponses: Array<unknown | Error>,
  finalOutputOverrides?: Partial<ConsistencyCheckOutput>,
): Array<unknown | Error> {
  return [...stageResponses, stageOutput(finalOutputOverrides)];
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

describe('validateConsistencyStageOutputContract', () => {
  it('rejects mixed actionable and follow-up output within one stage', () => {
    const violations = validateConsistencyStageOutputContract(
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

describe('validateConsistencyCheckOutputContract', () => {
  it('allows mixed actionable and follow-up output in the merged aggregate', () => {
    const violations = validateConsistencyCheckOutputContract(
      stageOutput({
        actionableItems: [actionableItem()],
        followUpQuestions: [followUpQuestion('q-1')],
      }),
    );

    expect(violations).toEqual([]);
  });
});

describe('executeConsistencyFollowUpPromptLayers', () => {
  it('declares explicit child FSM states and transitions', () => {
    const definition = createConsistencyFollowUpChildDefinition();

    expect(definition.initialState).toBe(CONSISTENCY_FOLLOW_UP_CHILD_START_STATE);
    expect(Object.keys(definition.states)).toEqual([
      CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
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
        to: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
        name: 'full-sweep-complete',
      },
      {
        from: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
        to: CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
        name: 'resolution-authored',
      },
    ]);
  });

  it('executes prompt layers in order, then delegates one PlanResolution prompt', async () => {
    const { ctx, launchChildSpy } = createChildContext(
      withPlanResolutionResponse(
        [
          narrowStageOutput(['hasScopeAndObjective'], {
            followUpQuestions: [followUpQuestion('q-1')],
            blockingIssues: [],
          }),
          narrowStageOutput(['hasInterfacesOrContracts'], {
            blockingIssues: [blockingIssue({ id: 'issue-2' })],
            followUpQuestions: [followUpQuestion('q-2')],
          }),
        ],
        {
          blockingIssues: [blockingIssue({ id: 'issue-2' })],
          followUpQuestions: [followUpQuestion('q-1'), followUpQuestion('q-2')],
        },
      ),
    );

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

    expect(launchChildSpy).toHaveBeenCalledTimes(3);
    expect(launchChildSpy.mock.calls[0][0].workflowType).toBe('app-builder.copilot.prompt.v1');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'Stage focus: scope and objective clarity',
    );
    expect(launchChildSpy.mock.calls[1][0].input.prompt).toContain(
      'Stage focus: interfaces and contracts',
    );
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain('Loop: 3');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'Remaining question IDs: ["q-old-1"]',
    );
    expect(JSON.parse(launchChildSpy.mock.calls[0][0].input.outputSchema).$id).toBe(
      SCHEMA_IDS.consistencyScopeObjectiveOutput,
    );
    expect(JSON.parse(launchChildSpy.mock.calls[1][0].input.outputSchema).$id).toBe(
      SCHEMA_IDS.consistencyInterfacesContractsOutput,
    );
    expect(launchChildSpy.mock.calls[2][0].correlationId).toBe(
      `PlanResolution:${TEMPLATE_IDS.consistencyResolution}`,
    );
    expect(launchChildSpy.mock.calls[2][0].input.prompt).toContain(
      'full consistency-check coverage sweep',
    );
    expect(launchChildSpy.mock.calls[2][0].input.prompt).toContain('Full coverage summary:');
    expect(launchChildSpy.mock.calls[2][0].input.prompt).toContain('scope-objective-consistency');
    expect(launchChildSpy.mock.calls[2][0].input.prompt).toContain(
      'interfaces-contracts-consistency',
    );
    expect(JSON.parse(launchChildSpy.mock.calls[2][0].input.outputSchema).$id).toBe(
      SCHEMA_IDS.consistencyCheckOutput,
    );
    expect(result.followUpQuestions.map((question) => question.questionId)).toEqual(['q-1', 'q-2']);
  });

  it('continues through later stages after actionableItems and aggregates executed-stage diagnostics', async () => {
    const { ctx, launchChildSpy } = createChildContext(
      withPlanResolutionResponse(
        [
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
          narrowStageOutput(['hasTestableAcceptanceCriteria'], {
            blockingIssues: [blockingIssue({ id: 'issue-3' })],
            actionableItems: [],
            followUpQuestions: [followUpQuestion('q-3')],
            readinessChecklist: readinessChecklist({ hasTestableAcceptanceCriteria: false }),
          }),
        ],
        {
          blockingIssues: [
            blockingIssue({ id: 'issue-1' }),
            blockingIssue({ id: 'issue-2' }),
            blockingIssue({ id: 'issue-3' }),
          ],
          actionableItems: [actionableItem()],
          followUpQuestions: [followUpQuestion('q-3')],
          readinessChecklist: readinessChecklist({
            hasInterfacesOrContracts: false,
            hasNoContradictions: false,
            hasTestableAcceptanceCriteria: false,
          }),
        },
      ),
    );

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
        stageId: 'post-actionable-stage',
        templateId: TEMPLATE_IDS.consistencyAcceptanceCriteria,
        outputSchema: SCHEMA_IDS.consistencyAcceptanceCriteriaOutput,
        checklistKeys: ['hasTestableAcceptanceCriteria'],
      },
    ]);

    expect(launchChildSpy).toHaveBeenCalledTimes(4);
    expect(result.actionableItems).toHaveLength(1);
    expect(result.followUpQuestions.map((question) => question.questionId)).toEqual(['q-3']);
    expect(result.blockingIssues.map((issue) => issue.id)).toEqual([
      'issue-1',
      'issue-2',
      'issue-3',
    ]);
    expect(result.readinessChecklist.hasInterfacesOrContracts).toBe(false);
    expect(result.readinessChecklist.hasNoContradictions).toBe(false);
    expect(result.readinessChecklist.hasTestableAcceptanceCriteria).toBe(false);
  });

  it('deduplicates cross-stage actionable itemId values keeping first occurrence and emits warn log', async () => {
    const { ctx, launchChildSpy, logSpy } = createChildContext(
      withPlanResolutionResponse(
        [
          narrowStageOutput(['hasInterfacesOrContracts'], {
            actionableItems: [actionableItem({ itemId: 'act-dup-1' })],
            followUpQuestions: [],
          }),
          narrowStageOutput(['hasTestableAcceptanceCriteria'], {
            actionableItems: [actionableItem({ itemId: 'act-dup-1', instruction: 'duplicate' })],
            followUpQuestions: [],
          }),
        ],
        {
          actionableItems: [actionableItem({ itemId: 'act-dup-1' })],
          followUpQuestions: [],
        },
      ),
    );

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
      {
        stageId: 'stage-1',
        templateId: TEMPLATE_IDS.consistencyInterfacesContracts,
        outputSchema: SCHEMA_IDS.consistencyInterfacesContractsOutput,
        checklistKeys: ['hasInterfacesOrContracts'],
      },
      {
        stageId: 'stage-2',
        templateId: TEMPLATE_IDS.consistencyAcceptanceCriteria,
        outputSchema: SCHEMA_IDS.consistencyAcceptanceCriteriaOutput,
        checklistKeys: ['hasTestableAcceptanceCriteria'],
      },
    ]);

    // All stages + PlanResolution executed
    expect(launchChildSpy).toHaveBeenCalledTimes(3);

    // First occurrence kept in final result
    expect(result.actionableItems).toHaveLength(1);
    expect(result.actionableItems[0].itemId).toBe('act-dup-1');
    expect(result.actionableItems[0].instruction).toBe('Add a deployment section.');

    // Warn-level log emitted for the skipped duplicate
    const warnLogs = logSpy.mock.calls.filter(
      (call: unknown[]) => (call[0] as { level?: string }).level === 'warn',
    );
    expect(warnLogs).toHaveLength(1);
    const warnPayload = (warnLogs[0][0] as { payload?: Record<string, unknown> }).payload!;
    expect(warnPayload.observabilityType).toBe('consistency.duplicate-skipped');
    expect(warnPayload.duplicateId).toBe('act-dup-1');
    expect(warnPayload.idType).toBe('itemId');
    expect(warnPayload.producingStageId).toBe('stage-2');
    expect(warnPayload.originStageId).toBe('stage-1');
  });

  it('deduplicates cross-stage questionId values keeping first occurrence and emits warn log', async () => {
    const { ctx, logSpy } = createChildContext(
      withPlanResolutionResponse(
        [
          narrowStageOutput(['hasScopeAndObjective'], {
            followUpQuestions: [followUpQuestion('q-1')],
          }),
          narrowStageOutput(['hasNonGoals'], {
            followUpQuestions: [followUpQuestion('q-1')],
          }),
        ],
        {
          followUpQuestions: [followUpQuestion('q-1')],
        },
      ),
    );

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
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
    ]);

    // First occurrence kept, duplicate dropped
    expect(result.followUpQuestions).toHaveLength(1);
    expect(result.followUpQuestions[0].questionId).toBe('q-1');

    // Warn-level log emitted for the skipped duplicate
    const warnLogs = logSpy.mock.calls.filter(
      (call: unknown[]) => (call[0] as { level?: string }).level === 'warn',
    );
    expect(warnLogs).toHaveLength(1);
    const warnPayload = (warnLogs[0][0] as { payload?: Record<string, unknown> }).payload!;
    expect(warnPayload.observabilityType).toBe('consistency.duplicate-skipped');
    expect(warnPayload.duplicateId).toBe('q-1');
    expect(warnPayload.idType).toBe('questionId');
    expect(warnPayload.producingStageId).toBe('stage-2');
    expect(warnPayload.originStageId).toBe('stage-1');
  });

  it('preserves prior follow-up questions when a later stage emits actionableItems', async () => {
    const { ctx } = createChildContext(
      withPlanResolutionResponse(
        [
          narrowStageOutput(['hasScopeAndObjective'], {
            followUpQuestions: [followUpQuestion('q-1')],
            actionableItems: [],
          }),
          narrowStageOutput(['hasInterfacesOrContracts'], {
            actionableItems: [actionableItem()],
            followUpQuestions: [],
          }),
        ],
        {
          actionableItems: [actionableItem()],
          followUpQuestions: [followUpQuestion('q-1')],
        },
      ),
    );

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
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
    ]);

    expect(result.followUpQuestions).toEqual([followUpQuestion('q-1')]);
    expect(result.actionableItems).toEqual([actionableItem()]);
  });

  it('uses the fine-grained default validation layer list', async () => {
    const { ctx, launchChildSpy } = createChildContext(
      withPlanResolutionResponse(
        [
          narrowStageOutput(['hasScopeAndObjective'], {
            followUpQuestions: [],
            blockingIssues: [],
          }),
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
        ],
        {
          followUpQuestions: [],
          blockingIssues: [],
        },
      ),
    );

    await executeConsistencyFollowUpPromptLayers(ctx, ctx.input);

    expect(launchChildSpy).toHaveBeenCalledTimes(7);
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'Stage focus: scope and objective clarity',
    );
    expect(launchChildSpy.mock.calls[5][0].input.prompt).toContain(
      'Stage focus: contradictions and implementation completeness',
    );
    expect(launchChildSpy.mock.calls[6][0].input.prompt).toContain(
      'full consistency-check coverage sweep',
    );
  });
});

describe('handleConsistencyFollowUpChild', () => {
  it('completes with the aggregated child result', async () => {
    const responses = withPlanResolutionResponse(
      CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer, index) => {
        if (index === 0) {
          return narrowStageOutput(layer.checklistKeys, {
            blockingIssues: [blockingIssue({ id: 'issue-1' })],
            actionableItems: [actionableItem()],
            followUpQuestions: [],
          });
        }

        return narrowStageOutput(layer.checklistKeys, {
          blockingIssues: [],
          actionableItems: [],
          followUpQuestions: [],
        });
      }),
      {
        blockingIssues: [blockingIssue({ id: 'issue-1' })],
        actionableItems: [actionableItem()],
        followUpQuestions: [],
      },
    );
    const { ctx, completeSpy, failSpy } = createChildContext(responses);

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

  it('emits PlanResolution completion observability before Done completes', async () => {
    const { ctx, logSpy } = createChildContext(
      withPlanResolutionResponse(
        CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.map((layer) =>
          narrowStageOutput(layer.checklistKeys, {
            blockingIssues: [],
            followUpQuestions: [],
          }),
        ),
        {
          blockingIssues: [],
          followUpQuestions: [],
        },
      ),
    );

    await handleConsistencyFollowUpChild(ctx);

    const planResolutionDelegation = logSpy.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { payload?: { state?: string } }).payload?.state ===
        CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
    );
    expect(planResolutionDelegation).toBeDefined();

    const planResolutionOutcome = logSpy.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { payload?: { state?: string; stageId?: string } }).payload?.state ===
          CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE &&
        (call[0] as { payload?: { state?: string; stageId?: string } }).payload?.stageId ===
          CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
    );
    expect(planResolutionOutcome).toBeDefined();
  });
});
