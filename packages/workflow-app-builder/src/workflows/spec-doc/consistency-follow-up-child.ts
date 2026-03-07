/**
 * Delegated consistency/follow-up child workflow for `app-builder.spec-doc.v1`.
 *
 * Executes one scoped prompt layer per `ExecutePromptLayer` state entry,
 * validates each stage against its narrow schema, merges outputs into the
 * aggregate child result, and self-loops until actionable items appear or the
 * configured stage list is exhausted.
 *
 * @module spec-doc/consistency-follow-up-child
 */

import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

import type {
  ConsistencyCheckOutput,
  ConsistencyChecklistKey,
  ConsistencyFollowUpChildInput,
  ConsistencyStageOutput,
  ReadinessChecklist,
} from './contracts.js';
import { buildDelegationRequest, delegateToCopilot } from './copilot-delegation.js';
import { emitConsistencyOutcome, emitDelegationStarted } from './observability.js';
import { getPromptTemplate, TEMPLATE_IDS, type PromptTemplateId } from './prompt-templates.js';
import { createSpecDocValidator } from './schema-validation.js';
import { SCHEMA_IDS, type SpecDocSchemaId } from './schemas.js';

export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE =
  'app-builder.spec-doc.consistency-follow-up.v1' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_VERSION = '1.0.0' as const;

export const CONSISTENCY_FOLLOW_UP_CHILD_START_STATE = 'start' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE = 'ExecutePromptLayer' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE = 'Done' as const;

export type ConsistencyFollowUpChildState =
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_START_STATE
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE;

export interface ConsistencyFollowUpPromptLayer {
  stageId: string;
  templateId: PromptTemplateId;
  outputSchema: SpecDocSchemaId;
  checklistKeys: readonly ConsistencyChecklistKey[];
}

export interface ConsistencyFollowUpChildStateData {
  stageIndex: number;
  aggregateOutput: ConsistencyCheckOutput;
  seenBlockingIssueIds: string[];
  seenActionableItemIds: string[];
  seenFollowUpQuestionIds: string[];
}

export const CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS = [
  {
    stageId: 'scope-objective-consistency',
    templateId: TEMPLATE_IDS.consistencyScopeObjective,
    outputSchema: SCHEMA_IDS.consistencyScopeObjectiveOutput,
    checklistKeys: ['hasScopeAndObjective'],
  },
  {
    stageId: 'non-goals-consistency',
    templateId: TEMPLATE_IDS.consistencyNonGoals,
    outputSchema: SCHEMA_IDS.consistencyNonGoalsOutput,
    checklistKeys: ['hasNonGoals'],
  },
  {
    stageId: 'constraints-assumptions-consistency',
    templateId: TEMPLATE_IDS.consistencyConstraintsAssumptions,
    outputSchema: SCHEMA_IDS.consistencyConstraintsAssumptionsOutput,
    checklistKeys: ['hasConstraintsAndAssumptions'],
  },
  {
    stageId: 'interfaces-contracts-consistency',
    templateId: TEMPLATE_IDS.consistencyInterfacesContracts,
    outputSchema: SCHEMA_IDS.consistencyInterfacesContractsOutput,
    checklistKeys: ['hasInterfacesOrContracts'],
  },
  {
    stageId: 'acceptance-criteria-consistency',
    templateId: TEMPLATE_IDS.consistencyAcceptanceCriteria,
    outputSchema: SCHEMA_IDS.consistencyAcceptanceCriteriaOutput,
    checklistKeys: ['hasTestableAcceptanceCriteria'],
  },
  {
    stageId: 'contradictions-completeness-consistency',
    templateId: TEMPLATE_IDS.consistencyContradictionsCompleteness,
    outputSchema: SCHEMA_IDS.consistencyContradictionsCompletenessOutput,
    checklistKeys: ['hasNoContradictions', 'hasSufficientDetail'],
  },
] as const satisfies readonly ConsistencyFollowUpPromptLayer[];

export const consistencyFollowUpChildTransitions: WorkflowTransitionDescriptor[] = [
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
] as const;

const DEFAULT_READINESS_CHECKLIST: ReadinessChecklist = {
  hasScopeAndObjective: true,
  hasNonGoals: true,
  hasConstraintsAndAssumptions: true,
  hasInterfacesOrContracts: true,
  hasTestableAcceptanceCriteria: true,
  hasNoContradictions: true,
  hasSufficientDetail: true,
};

function cloneDefaultReadinessChecklist(): ReadinessChecklist {
  return { ...DEFAULT_READINESS_CHECKLIST };
}

export function createInitialConsistencyFollowUpChildStateData(): ConsistencyFollowUpChildStateData {
  return {
    stageIndex: 0,
    aggregateOutput: {
      blockingIssues: [],
      actionableItems: [],
      followUpQuestions: [],
      readinessChecklist: cloneDefaultReadinessChecklist(),
    },
    seenBlockingIssueIds: [],
    seenActionableItemIds: [],
    seenFollowUpQuestionIds: [],
  };
}

function mergeReadinessChecklist(
  aggregate: ReadinessChecklist,
  stage: Partial<ReadinessChecklist>,
  checklistKeys: readonly ConsistencyChecklistKey[],
): ReadinessChecklist {
  const nextAggregate = { ...aggregate };

  for (const checklistKey of checklistKeys) {
    nextAggregate[checklistKey] = aggregate[checklistKey] && Boolean(stage[checklistKey]);
  }

  return nextAggregate;
}

function pushUniqueBlockingIssues(
  aggregate: ConsistencyCheckOutput,
  seenBlockingIssueIds: Set<string>,
  stageOutput: Pick<ConsistencyStageOutput, 'blockingIssues'>,
): void {
  for (const blockingIssue of stageOutput.blockingIssues) {
    if (seenBlockingIssueIds.has(blockingIssue.id)) {
      continue;
    }
    seenBlockingIssueIds.add(blockingIssue.id);
    aggregate.blockingIssues.push(blockingIssue);
  }
}

function ensureUniqueStageIds(layers: readonly ConsistencyFollowUpPromptLayer[]): void {
  const seenStageIds = new Set<string>();
  const seenTemplateIds = new Set<PromptTemplateId>();

  for (const layer of layers) {
    if (layer.stageId.trim().length === 0) {
      throw new Error('Prompt layer stageId must be non-empty');
    }
    if (seenStageIds.has(layer.stageId)) {
      throw new Error(`Duplicate prompt-layer stageId: ${layer.stageId}`);
    }
    if (layer.checklistKeys.length === 0) {
      throw new Error(
        `Prompt layer ${layer.stageId} must declare at least one readinessChecklist key`,
      );
    }

    const template = getPromptTemplate(layer.templateId);
    if (template.outputSchemaId !== layer.outputSchema) {
      throw new Error(
        `Prompt layer ${layer.stageId} outputSchema must match template ${layer.templateId}`,
      );
    }

    if (seenTemplateIds.has(layer.templateId)) {
      throw new Error(`Duplicate prompt-layer templateId: ${layer.templateId}`);
    }

    seenStageIds.add(layer.stageId);
    seenTemplateIds.add(layer.templateId);
  }
}

export function validateConsistencyFollowUpChildInput(
  input: ConsistencyFollowUpChildInput,
): string[] {
  const violations: string[] = [];

  if (input.request.trim().length === 0) {
    violations.push('request must be a non-empty string');
  }
  if (input.specPath.trim().length === 0) {
    violations.push('specPath must be a non-empty string from the latest integration pass');
  }
  if (!input.specPath.endsWith('.md')) {
    violations.push('specPath must reference a markdown file');
  }
  if (!Number.isInteger(input.loopCount) || input.loopCount < 0) {
    violations.push('loopCount must be a non-negative integer');
  }
  for (const [index, constraint] of input.constraints.entries()) {
    if (constraint.trim().length === 0) {
      violations.push(`constraints[${index}] must be a non-empty string`);
    }
  }
  for (const [index, questionId] of input.remainingQuestionIds.entries()) {
    if (questionId.trim().length === 0) {
      violations.push(`remainingQuestionIds[${index}] must be a non-empty string`);
    }
  }

  return violations;
}

function validateProsConsDescriptions(
  output: Pick<ConsistencyStageOutput, 'followUpQuestions'>,
): string[] {
  const violations: string[] = [];
  for (const question of output.followUpQuestions) {
    for (const option of question.options) {
      if (!option.description) {
        violations.push(
          `Question "${question.questionId}" option ${option.id}: missing description`,
        );
        continue;
      }
      if (!option.description.includes('Pros:')) {
        violations.push(
          `Question "${question.questionId}" option ${option.id}: description missing "Pros:" content`,
        );
      }
      if (!option.description.includes('Cons:')) {
        violations.push(
          `Question "${question.questionId}" option ${option.id}: description missing "Cons:" content`,
        );
      }
    }
  }
  return violations;
}

function validateConsistencyOutputContractCore(
  output: Pick<ConsistencyStageOutput, 'followUpQuestions'>,
): string[] {
  const violations: string[] = [];

  violations.push(...validateProsConsDescriptions(output));
  return violations;
}

export function validateConsistencyStageOutputContract(output: ConsistencyStageOutput): string[] {
  const violations = validateConsistencyOutputContractCore(output);

  if (output.actionableItems.length > 0 && output.followUpQuestions.length > 0) {
    violations.push('actionableItems and followUpQuestions must be mutually exclusive');
  }

  return violations;
}

export function validateConsistencyCheckOutputContract(output: ConsistencyCheckOutput): string[] {
  const violations = validateConsistencyOutputContractCore(output);

  const seenActionableIds = new Set<string>();
  for (const item of output.actionableItems) {
    if (seenActionableIds.has(item.itemId)) {
      violations.push(`duplicate actionable itemId: ${item.itemId}`);
      continue;
    }
    seenActionableIds.add(item.itemId);
  }

  const seenQuestionIds = new Set<string>();
  for (const question of output.followUpQuestions) {
    if (seenQuestionIds.has(question.questionId)) {
      violations.push(`duplicate follow-up questionId: ${question.questionId}`);
      continue;
    }
    seenQuestionIds.add(question.questionId);
  }

  return violations;
}

function createStateDataSet(values: readonly string[]): Set<string> {
  return new Set(values);
}

function cloneAggregateOutput(output: ConsistencyCheckOutput): ConsistencyCheckOutput {
  return {
    blockingIssues: [...output.blockingIssues],
    actionableItems: [...output.actionableItems],
    followUpQuestions: [...output.followUpQuestions],
    readinessChecklist: { ...output.readinessChecklist },
  };
}

function coerceStateData(data: unknown): ConsistencyFollowUpChildStateData {
  if (!data || typeof data !== 'object') {
    throw new Error('Child state data is required for ExecutePromptLayer and Done');
  }

  const candidate = data as Partial<ConsistencyFollowUpChildStateData>;
  if (
    typeof candidate.stageIndex !== 'number' ||
    !candidate.aggregateOutput ||
    !Array.isArray(candidate.seenBlockingIssueIds) ||
    !Array.isArray(candidate.seenActionableItemIds) ||
    !Array.isArray(candidate.seenFollowUpQuestionIds)
  ) {
    throw new Error('Invalid child state data');
  }

  return candidate as ConsistencyFollowUpChildStateData;
}

async function runPromptLayer(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  input: ConsistencyFollowUpChildInput,
  layer: ConsistencyFollowUpPromptLayer,
): Promise<ConsistencyStageOutput> {
  const request = {
    ...buildDelegationRequest(
      layer.templateId,
      {
        request: input.request,
        specPath: input.specPath,
        constraintsJson: JSON.stringify(input.constraints),
        loopCount: String(input.loopCount),
        remainingQuestionIdsJson: JSON.stringify(input.remainingQuestionIds),
        stageId: layer.stageId,
      },
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      input.copilotPromptOptions,
    ),
    outputSchemaId: layer.outputSchema,
  };

  emitDelegationStarted(ctx, {
    state: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
    promptTemplateId: layer.templateId,
    outputSchemaId: layer.outputSchema,
    childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    stageId: layer.stageId,
  });

  const result = await delegateToCopilot<ConsistencyStageOutput>(ctx, request);
  const validation = createSpecDocValidator().validateParsed<ConsistencyStageOutput>(
    result.structuredOutput,
    layer.outputSchema,
  );

  if (!validation.ok) {
    throw new Error(
      `[${layer.stageId}] Output schema validation failed: ` +
        `${validation.error.details} (schema: ${validation.error.schemaId})`,
    );
  }

  const stageOutput = validation.value;
  const stageViolations = validateConsistencyStageOutputContract(stageOutput);
  if (stageViolations.length > 0) {
    throw new Error(`[${layer.stageId}] Contract violation: ${stageViolations.join('; ')}`);
  }

  return stageOutput;
}

function mergeStageOutput(
  stateData: ConsistencyFollowUpChildStateData,
  layer: ConsistencyFollowUpPromptLayer,
  stageOutput: ConsistencyStageOutput,
): ConsistencyFollowUpChildStateData {
  const aggregate = cloneAggregateOutput(stateData.aggregateOutput);
  const seenBlockingIssueIds = createStateDataSet(stateData.seenBlockingIssueIds);
  const seenActionableIds = createStateDataSet(stateData.seenActionableItemIds);
  const seenQuestionIds = createStateDataSet(stateData.seenFollowUpQuestionIds);

  pushUniqueBlockingIssues(aggregate, seenBlockingIssueIds, stageOutput);
  aggregate.readinessChecklist = mergeReadinessChecklist(
    aggregate.readinessChecklist,
    stageOutput.readinessChecklist,
    layer.checklistKeys,
  );

  for (const item of stageOutput.actionableItems) {
    if (seenActionableIds.has(item.itemId)) {
      throw new Error(
        `[${layer.stageId}] Contract violation: duplicate actionable itemId: ${item.itemId}`,
      );
    }
    seenActionableIds.add(item.itemId);
    aggregate.actionableItems.push(item);
  }

  for (const question of stageOutput.followUpQuestions) {
    if (seenQuestionIds.has(question.questionId)) {
      throw new Error(
        `[${layer.stageId}] Contract violation: duplicate follow-up questionId: ${question.questionId}`,
      );
    }
    seenQuestionIds.add(question.questionId);
    aggregate.followUpQuestions.push(question);
  }

  return {
    stageIndex: stateData.stageIndex + 1,
    aggregateOutput: aggregate,
    seenBlockingIssueIds: [...seenBlockingIssueIds],
    seenActionableItemIds: [...seenActionableIds],
    seenFollowUpQuestionIds: [...seenQuestionIds],
  };
}

function createStartHandler(
  layers: readonly ConsistencyFollowUpPromptLayer[],
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>['states'][string] {
  return async (ctx) => {
    try {
      const inputViolations = validateConsistencyFollowUpChildInput(ctx.input);
      if (inputViolations.length > 0) {
        throw new Error(`Invalid child input: ${inputViolations.join('; ')}`);
      }

      if (layers.length === 0) {
        throw new Error('CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS must contain at least one stage');
      }
      ensureUniqueStageIds(layers);

      ctx.transition(
        CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        createInitialConsistencyFollowUpChildStateData(),
      );
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

function createExecutePromptLayerHandler(
  layers: readonly ConsistencyFollowUpPromptLayer[],
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>['states'][string] {
  return async (ctx, data) => {
    try {
      const stateData = coerceStateData(data);
      const layer = layers[stateData.stageIndex];

      if (!layer) {
        throw new Error(`Invalid child stageIndex: ${stateData.stageIndex}`);
      }

      const stageOutput = await runPromptLayer(ctx, ctx.input, layer);
      const nextStateData = mergeStageOutput(stateData, layer, stageOutput);
      const hasActionableItems = nextStateData.aggregateOutput.actionableItems.length > 0;
      const lastStageCompleted = nextStateData.stageIndex >= layers.length;

      ctx.transition(
        hasActionableItems || lastStageCompleted
          ? CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE
          : CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        nextStateData,
      );
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

function createDoneHandler(
  layers: readonly ConsistencyFollowUpPromptLayer[],
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>['states'][string] {
  return async (ctx, data) => {
    try {
      const stateData = coerceStateData(data);
      const aggregateValidation = createSpecDocValidator().validateParsed<ConsistencyCheckOutput>(
        stateData.aggregateOutput,
        SCHEMA_IDS.consistencyCheckOutput,
      );

      if (!aggregateValidation.ok) {
        throw new Error(
          `Aggregate output schema validation failed: ${aggregateValidation.error.details} ` +
            `(schema: ${aggregateValidation.error.schemaId})`,
        );
      }

      const output = aggregateValidation.value;
      const finalViolations = validateConsistencyCheckOutputContract(output);
      if (finalViolations.length > 0) {
        throw new Error(`Aggregate contract violation: ${finalViolations.join('; ')}`);
      }

      const lastExecutedStageIndex = Math.max(
        0,
        Math.min(stateData.stageIndex - 1, layers.length - 1),
      );
      const finalLayer = layers[lastExecutedStageIndex];

      emitConsistencyOutcome(ctx, {
        state: CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
        blockingIssuesCount: output.blockingIssues.length,
        actionableItemsCount: output.actionableItems.length,
        followUpQuestionsCount: output.followUpQuestions.length,
        passNumber: ctx.input.loopCount,
        promptTemplateId: finalLayer.templateId,
        childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
        stageId: finalLayer.stageId,
      });

      ctx.complete(output);
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

async function runChildStateMachine(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  definition: WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  maxSteps: number,
): Promise<ConsistencyCheckOutput> {
  let currentState = definition.initialState;
  let currentData: unknown;
  let completedOutput: ConsistencyCheckOutput | undefined;
  let failedError: Error | undefined;

  for (let step = 0; step < maxSteps; step += 1) {
    const handler = definition.states[currentState];
    if (!handler) {
      throw new Error(`No handler for child state "${currentState}"`);
    }

    let transitionTarget: { to: string; data: unknown } | undefined;
    const childCtx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput> = {
      runId: ctx.runId,
      workflowType: ctx.workflowType,
      input: ctx.input,
      now: ctx.now,
      log: ctx.log,
      transition: (to, data) => {
        transitionTarget = { to, data };
      },
      launchChild: ctx.launchChild,
      runCommand: ctx.runCommand,
      complete: (output) => {
        completedOutput = output;
      },
      fail: (error) => {
        failedError = error;
      },
    };

    await handler(childCtx, currentData);

    if (completedOutput) {
      return completedOutput;
    }
    if (failedError) {
      throw failedError;
    }
    if (!transitionTarget) {
      throw new Error(`Child state "${currentState}" did not transition, complete, or fail`);
    }

    currentState = transitionTarget.to;
    currentData = transitionTarget.data;
  }

  throw new Error('Child workflow exceeded the maximum number of allowed state transitions');
}

export async function executeConsistencyFollowUpPromptLayers(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  input: ConsistencyFollowUpChildInput,
  layers: readonly ConsistencyFollowUpPromptLayer[] = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
): Promise<ConsistencyCheckOutput> {
  const statefulCtx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput> = {
    ...ctx,
    input,
  };

  return runChildStateMachine(
    statefulCtx,
    createConsistencyFollowUpChildDefinition(layers),
    layers.length + 3,
  );
}

export async function handleConsistencyFollowUpChild(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
): Promise<void> {
  try {
    const output = await executeConsistencyFollowUpPromptLayers(ctx, ctx.input);
    ctx.complete(output);
  } catch (err) {
    ctx.fail(err instanceof Error ? err : new Error(String(err)));
  }
}

export function createConsistencyFollowUpChildDefinition(
  layers: readonly ConsistencyFollowUpPromptLayer[] = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput> {
  return {
    initialState: CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
    transitions: [...consistencyFollowUpChildTransitions],
    states: {
      [CONSISTENCY_FOLLOW_UP_CHILD_START_STATE]: createStartHandler(layers),
      [CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE]: createExecutePromptLayerHandler(layers),
      [CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE]: createDoneHandler(layers),
    },
  };
}

export const consistencyFollowUpChildWorkflowRegistration: WorkflowRegistration<
  ConsistencyFollowUpChildInput,
  ConsistencyCheckOutput
> = {
  workflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  workflowVersion: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_VERSION,
  metadata: {
    displayName: 'Spec-Doc Consistency Follow-Up Child Workflow',
    description:
      'Implementation-owned delegated child workflow for layered consistency checking and follow-up generation.',
    tags: ['app-builder', 'spec-doc', 'child-workflow'],
  },
  factory: () => createConsistencyFollowUpChildDefinition(),
};
