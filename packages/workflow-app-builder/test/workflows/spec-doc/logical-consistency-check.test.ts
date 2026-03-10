import { describe, expect, it, vi } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  BlockingIssue,
  ConsistencyCheckOutput,
  NumberedQuestionItem,
  NumberedQuestionOption,
  ReadinessChecklist,
  SpecActionableItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../../../src/workflows/spec-doc/contracts.js';
import {
  handleLogicalConsistencyCheck,
  LOGICAL_CONSISTENCY_CHECK_STATE,
} from '../../../src/workflows/spec-doc/states/logical-consistency-check.js';
import { TEMPLATE_IDS } from '../../../src/workflows/spec-doc/prompt-templates.js';
import {
  COMPLETION_CONFIRMATION_QUESTION_ID,
  buildQuestionQueue,
} from '../../../src/workflows/spec-doc/queue.js';
import { CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE } from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import {
  type SpecDocStateData,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';

function validReadinessChecklist(overrides?: Partial<ReadinessChecklist>): ReadinessChecklist {
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

function makeOption(id: number, label: string): NumberedQuestionOption {
  return {
    id,
    label,
    description: `${label}. Pros: benefit. Cons: drawback.`,
  };
}

function makeBlockingIssue(overrides?: Partial<BlockingIssue>): BlockingIssue {
  return {
    id: 'issue-1',
    description: 'Missing error handling strategy',
    severity: 'high',
    ...overrides,
  };
}

function makeFollowUpQuestion(
  questionId: string,
  overrides?: Partial<NumberedQuestionItem>,
): NumberedQuestionItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve issue for ${questionId}`,
    options: [makeOption(1, 'Option A'), makeOption(2, 'Option B')],
    ...overrides,
  };
}

function makeActionableItem(overrides?: Partial<SpecActionableItem>): SpecActionableItem {
  return {
    itemId: 'act-1',
    instruction: 'Add explicit API request/response examples.',
    rationale: 'The current draft omits concrete interface examples.',
    blockingIssueIds: ['issue-1'],
    ...overrides,
  };
}

function validConsistencyOutput(
  overrides?: Partial<ConsistencyCheckOutput>,
): ConsistencyCheckOutput {
  return {
    blockingIssues: [makeBlockingIssue()],
    actionableItems: [],
    followUpQuestions: [makeFollowUpQuestion('q-cc-1')],
    readinessChecklist: validReadinessChecklist(),
    ...overrides,
  };
}

function emptyConsistencyOutput(): ConsistencyCheckOutput {
  return {
    blockingIssues: [],
    actionableItems: [],
    followUpQuestions: [],
    readinessChecklist: validReadinessChecklist(),
  };
}

interface MockCtxOptions {
  input?: Partial<SpecDocGenerationInput>;
  childOutput?: ConsistencyCheckOutput;
  childThrows?: Error;
}

function createMockContext(opts: MockCtxOptions = {}) {
  const launchChildSpy = opts.childThrows
    ? vi.fn().mockRejectedValue(opts.childThrows)
    : vi.fn().mockResolvedValue(opts.childOutput ?? validConsistencyOutput());
  const transitionSpy = vi.fn();
  const failSpy = vi.fn();
  const logSpy = vi.fn();

  const ctx = {
    runId: 'run-001',
    workflowType: 'app-builder.spec-doc.v1',
    input: {
      request: 'Build a TODO app',
      targetPath: 'specs/todo.md',
      constraints: ['Must use React', 'Must support offline'],
      ...opts.input,
    },
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

function stateDataWithIntegrationOutput(
  remainingQuestionIds: string[] = ['q-open-1'],
  specPath = 'specs/todo.md',
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    artifacts: {
      specPath,
      lastIntegrationOutput: {
        specPath,
        changeSummary: ['Added scope'],
        resolvedQuestionIds: [],
        remainingQuestionIds,
      },
    },
  };
}

describe('buildQuestionQueue', () => {
  it('synthesizes completion-confirmation for an empty follow-up list', () => {
    const queue = buildQuestionQueue([]);
    expect(queue).toHaveLength(1);
    expect(queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
  });
});

describe('handleLogicalConsistencyCheck', () => {
  it('routes to IntegrateIntoSpec when the child returns actionableItems', async () => {
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: validConsistencyOutput({
        actionableItems: [makeActionableItem()],
        followUpQuestions: [],
      }),
    });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      'IntegrateIntoSpec',
      expect.objectContaining({
        source: 'consistency-action-items',
        actionableItems: [makeActionableItem()],
      }),
    );
  });

  it('routes to NumberedOptionsHumanRequest with stashed actionable items for mixed aggregates', async () => {
    const mixedOutput = validConsistencyOutput({
      actionableItems: [makeActionableItem()],
      followUpQuestions: [makeFollowUpQuestion('q-mixed-1')],
    });
    const { ctx, transitionSpy, failSpy } = createMockContext({ childOutput: mixedOutput });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      'NumberedOptionsHumanRequest',
      expect.objectContaining({
        stashedActionableItems: [makeActionableItem()],
      }),
    );
    // Verify queue was built from follow-up questions (sorted + completion-confirmation)
    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.queue.length).toBeGreaterThan(0);
    expect(transitionData.queue.some((item) => item.questionId === 'q-mixed-1')).toBe(true);
  });

  it('does not fail when child produces stage-local mixed output and both arrays reach PlanResolution', async () => {
    // Stage-local mixed output (both actionableItems and followUpQuestions from a single stage)
    // should not trigger a child failure. Both arrays should flow through the aggregate to the parent.
    const mixedStageOutput = validConsistencyOutput({
      actionableItems: [makeActionableItem({ itemId: 'act-stage-mix-1' })],
      followUpQuestions: [makeFollowUpQuestion('q-stage-mix-1')],
    });
    const { ctx, transitionSpy, failSpy } = createMockContext({ childOutput: mixedStageOutput });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith(
      'NumberedOptionsHumanRequest',
      expect.objectContaining({
        stashedActionableItems: [makeActionableItem({ itemId: 'act-stage-mix-1' })],
      }),
    );
    const transitionData = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitionData.queue.some((item) => item.questionId === 'q-stage-mix-1')).toBe(true);
  });

  it('routes to IntegrateIntoSpec for actionable-items-only (no follow-up questions)', async () => {
    const { ctx, transitionSpy, failSpy } = createMockContext({
      childOutput: validConsistencyOutput({
        actionableItems: [makeActionableItem()],
        followUpQuestions: [],
      }),
    });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      'IntegrateIntoSpec',
      expect.objectContaining({
        source: 'consistency-action-items',
        actionableItems: [makeActionableItem()],
      }),
    );
    // Should NOT have stashedActionableItems
    const transitionData = transitionSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(transitionData.stashedActionableItems).toBeUndefined();
  });

  it('routes to NumberedOptionsHumanRequest with sorted follow-up questions', async () => {
    const output = validConsistencyOutput({
      blockingIssues: [makeBlockingIssue({ id: 'issue-1' }), makeBlockingIssue({ id: 'issue-2' })],
      followUpQuestions: [makeFollowUpQuestion('q-2'), makeFollowUpQuestion('q-1')],
    });
    const { ctx, transitionSpy, failSpy } = createMockContext({ childOutput: output });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      'NumberedOptionsHumanRequest',
      expect.objectContaining({
        queue: [
          expect.objectContaining({ questionId: 'q-1' }),
          expect.objectContaining({ questionId: 'q-2' }),
        ],
      }),
    );
  });

  it('synthesizes a completion-confirmation queue item when child output is empty', async () => {
    const { ctx, transitionSpy } = createMockContext({ childOutput: emptyConsistencyOutput() });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    const transitioned = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitioned.queue).toHaveLength(1);
    expect(transitioned.queue[0].questionId).toBe(COMPLETION_CONFIRMATION_QUESTION_ID);
  });

  it('passes latest integration specPath, remainingQuestionIds, and unchanged loopCount to the child', async () => {
    const stateData = stateDataWithIntegrationOutput(['q-1', 'q-2'], 'specs/latest.md');
    stateData.counters.consistencyCheckPasses = 4;
    const { ctx, launchChildSpy } = createMockContext();

    await handleLogicalConsistencyCheck(ctx, stateData);

    expect(launchChildSpy).toHaveBeenCalledWith({
      workflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      input: {
        request: 'Build a TODO app',
        specPath: 'specs/latest.md',
        constraints: ['Must use React', 'Must support offline'],
        loopCount: 4,
        remainingQuestionIds: ['q-1', 'q-2'],
        copilotPromptOptions: undefined,
      },
      correlationId: `${LOGICAL_CONSISTENCY_CHECK_STATE}:${CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE}`,
    });
  });

  it('increments consistencyCheckPasses after a successful delegated child run', async () => {
    const { ctx, transitionSpy } = createMockContext({ childOutput: emptyConsistencyOutput() });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    const transitioned = transitionSpy.mock.calls[0][1] as SpecDocStateData;
    expect(transitioned.counters.consistencyCheckPasses).toBe(1);
  });

  it('records parent observability against the final PlanResolution template', async () => {
    const { ctx, logSpy } = createMockContext({ childOutput: emptyConsistencyOutput() });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    const delegationPayload = logSpy.mock.calls[0][0].payload as {
      promptTemplateId: string;
      state: string;
    };
    expect(delegationPayload.state).toBe(LOGICAL_CONSISTENCY_CHECK_STATE);
    expect(delegationPayload.promptTemplateId).toBe(TEMPLATE_IDS.consistencyResolution);

    const outcomePayload = logSpy.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { payload?: { state?: string; observabilityType?: string } }).payload?.state ===
          LOGICAL_CONSISTENCY_CHECK_STATE &&
        (call[0] as { payload?: { state?: string; observabilityType?: string } }).payload
          ?.observabilityType === 'spec-doc.consistency-check.completed',
    )?.[0] as { payload: { promptTemplateId: string } };
    expect(outcomePayload.payload.promptTemplateId).toBe(TEMPLATE_IDS.consistencyResolution);
  });

  it('fails when the child aggregate output violates the shared contract', async () => {
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childOutput: validConsistencyOutput({
        actionableItems: [],
        followUpQuestions: [
          makeFollowUpQuestion('q-1', {
            options: [
              makeOption(1, 'Option A'),
              { id: 2, label: 'Option B', description: 'No pros or cons here' },
            ],
          }),
        ],
      }),
    });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
    const error = failSpy.mock.calls[0][0] as Error;
    expect(error.message).toContain('Output schema validation failed');
  });

  it('fails on child workflow delegation errors', async () => {
    const { ctx, failSpy, transitionSpy } = createMockContext({
      childThrows: new Error('child unavailable'),
    });

    await handleLogicalConsistencyCheck(ctx, stateDataWithIntegrationOutput());

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).not.toHaveBeenCalled();
  });
});
