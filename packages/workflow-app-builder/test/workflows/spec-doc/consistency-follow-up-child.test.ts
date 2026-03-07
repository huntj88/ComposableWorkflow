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
  CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  executeConsistencyFollowUpPromptLayers,
  handleConsistencyFollowUpChild,
  validateConsistencyCheckOutputContract,
} from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
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

function createChildContext(responses: Array<ConsistencyCheckOutput | Error>) {
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
  it('executes prompt layers in order and forwards stage metadata', async () => {
    const { ctx, launchChildSpy } = createChildContext([
      stageOutput({ followUpQuestions: [followUpQuestion('q-1')], blockingIssues: [] }),
      stageOutput({
        blockingIssues: [blockingIssue({ id: 'issue-2' })],
        followUpQuestions: [followUpQuestion('q-2')],
      }),
    ]);

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
      { stageId: 'baseline-consistency', templateId: TEMPLATE_IDS.consistencyCheck },
      { stageId: 'deep-consistency', templateId: TEMPLATE_IDS.consistencyCheck },
    ]);

    expect(launchChildSpy).toHaveBeenCalledTimes(2);
    expect(launchChildSpy.mock.calls[0][0].workflowType).toBe('app-builder.copilot.prompt.v1');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'currentStageId: baseline-consistency',
    );
    expect(launchChildSpy.mock.calls[1][0].input.prompt).toContain(
      'currentStageId: deep-consistency',
    );
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain('currentLoopCount: 3');
    expect(launchChildSpy.mock.calls[0][0].input.prompt).toContain(
      'remainingQuestionIdsFromIntegration: ["q-old-1"]',
    );
    expect(result.followUpQuestions.map((question) => question.questionId)).toEqual(['q-1', 'q-2']);
  });

  it('short-circuits later stages after actionableItems and aggregates executed-stage diagnostics', async () => {
    const { ctx, launchChildSpy } = createChildContext([
      stageOutput({
        blockingIssues: [blockingIssue({ id: 'issue-1' })],
        followUpQuestions: [],
        readinessChecklist: readinessChecklist({ hasInterfacesOrContracts: false }),
      }),
      stageOutput({
        blockingIssues: [blockingIssue({ id: 'issue-1' }), blockingIssue({ id: 'issue-2' })],
        actionableItems: [actionableItem()],
        followUpQuestions: [],
        readinessChecklist: readinessChecklist({ hasNoContradictions: false }),
      }),
    ]);

    const result = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
      { stageId: 'baseline-consistency', templateId: TEMPLATE_IDS.consistencyCheck },
      { stageId: 'action-layer', templateId: TEMPLATE_IDS.consistencyCheck },
      { stageId: 'should-not-run', templateId: TEMPLATE_IDS.consistencyCheck },
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
      stageOutput({ followUpQuestions: [followUpQuestion('q-1')] }),
      stageOutput({ followUpQuestions: [followUpQuestion('q-1')] }),
    ]);

    await expect(
      executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
        { stageId: 'stage-1', templateId: TEMPLATE_IDS.consistencyCheck },
        { stageId: 'stage-2', templateId: TEMPLATE_IDS.consistencyCheck },
      ]),
    ).rejects.toThrow('duplicate follow-up questionId: q-1');
  });

  it('fails when actionableItems appear after prior follow-up questions', async () => {
    const { ctx } = createChildContext([
      stageOutput({ followUpQuestions: [followUpQuestion('q-1')], actionableItems: [] }),
      stageOutput({ actionableItems: [actionableItem()], followUpQuestions: [] }),
    ]);

    await expect(
      executeConsistencyFollowUpPromptLayers(ctx, ctx.input, [
        { stageId: 'stage-1', templateId: TEMPLATE_IDS.consistencyCheck },
        { stageId: 'stage-2', templateId: TEMPLATE_IDS.consistencyCheck },
      ]),
    ).rejects.toThrow('actionableItems cannot appear after followUpQuestions');
  });
});

describe('handleConsistencyFollowUpChild', () => {
  it('completes with the aggregated child result', async () => {
    const { ctx, completeSpy, failSpy } = createChildContext([
      stageOutput({
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
