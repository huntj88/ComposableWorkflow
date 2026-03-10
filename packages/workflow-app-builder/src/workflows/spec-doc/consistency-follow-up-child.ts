/**
 * Delegated consistency/follow-up child workflow for `app-builder.spec-doc.v1`.
 *
 * Executes one scoped prompt layer per `ExecutePromptLayer` state entry,
 * validates each stage against its narrow schema, accumulates deterministic
 * full-sweep coverage state, then delegates one `PlanResolution` prompt that
 * authors the only final child result consumed by the parent.
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
import {
  emitConsistencyOutcome,
  emitDelegationStarted,
  emitDuplicateSkipped,
} from './observability.js';
import { getPromptTemplate, TEMPLATE_IDS, type PromptTemplateId } from './prompt-templates.js';
import { createSpecDocValidator } from './schema-validation.js';
import { SCHEMA_IDS, type SpecDocSchemaId } from './schemas.js';

export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE =
  'app-builder.spec-doc.consistency-follow-up.v1' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_VERSION = '1.0.0' as const;

export const CONSISTENCY_FOLLOW_UP_CHILD_START_STATE = 'start' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE = 'ExecutePromptLayer' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE = 'PlanResolution' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE = 'Done' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID = 'plan-resolution' as const;

export type ConsistencyFollowUpChildState =
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_START_STATE
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE
  | typeof CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE
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
  seenActionableItemOrigins: Array<[string, string]>;
  seenFollowUpQuestionOrigins: Array<[string, string]>;
  executedStages: ConsistencyFollowUpStageExecution[];
  finalOutput?: ConsistencyCheckOutput;
}

export interface ConsistencyFollowUpStageExecution {
  stageId: string;
  templateId: PromptTemplateId;
  outputSchema: SpecDocSchemaId;
  output: ConsistencyStageOutput;
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
    to: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
    name: 'full-sweep-complete',
  },
  {
    from: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
    to: CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
    name: 'resolution-authored',
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
    seenActionableItemOrigins: [],
    seenFollowUpQuestionOrigins: [],
    executedStages: [],
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
  return validateConsistencyOutputContractCore(output);
}

export function validateConsistencyCheckOutputContract(output: ConsistencyCheckOutput): string[] {
  // Duplicate itemId / questionId checks removed: mergeStageOutput now
  // guarantees uniqueness via dedup-and-skip before PlanResolution runs.
  return validateConsistencyOutputContractCore(output);
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

function cloneStageOutput(output: ConsistencyStageOutput): ConsistencyStageOutput {
  return {
    blockingIssues: [...output.blockingIssues],
    actionableItems: [...output.actionableItems],
    followUpQuestions: [...output.followUpQuestions],
    readinessChecklist: { ...output.readinessChecklist },
  };
}

function cloneExecutedStages(
  executedStages: readonly ConsistencyFollowUpStageExecution[],
): ConsistencyFollowUpStageExecution[] {
  return executedStages.map((stage) => ({
    stageId: stage.stageId,
    templateId: stage.templateId,
    outputSchema: stage.outputSchema,
    output: cloneStageOutput(stage.output),
  }));
}

function cloneChildStateData(
  stateData: ConsistencyFollowUpChildStateData,
): ConsistencyFollowUpChildStateData {
  return {
    stageIndex: stateData.stageIndex,
    aggregateOutput: cloneAggregateOutput(stateData.aggregateOutput),
    seenBlockingIssueIds: [...stateData.seenBlockingIssueIds],
    seenActionableItemIds: [...stateData.seenActionableItemIds],
    seenFollowUpQuestionIds: [...stateData.seenFollowUpQuestionIds],
    seenActionableItemOrigins: stateData.seenActionableItemOrigins.map(
      ([id, stageId]) => [id, stageId] as [string, string],
    ),
    seenFollowUpQuestionOrigins: stateData.seenFollowUpQuestionOrigins.map(
      ([id, stageId]) => [id, stageId] as [string, string],
    ),
    executedStages: cloneExecutedStages(stateData.executedStages),
    ...(stateData.finalOutput ? { finalOutput: cloneAggregateOutput(stateData.finalOutput) } : {}),
  };
}

interface ConsistencyResolutionCoverageStageSummary {
  order: number;
  stageId: string;
  promptTemplateId: PromptTemplateId;
  outputSchemaId: SpecDocSchemaId;
  output: ConsistencyStageOutput;
}

interface ConsistencyResolutionCoverageSummary {
  aggregateCoverage: ConsistencyCheckOutput;
  executedStageCount: number;
  executedStageIds: string[];
  executedStages: ConsistencyResolutionCoverageStageSummary[];
}

function buildConsistencyResolutionCoverageSummary(
  stateData: ConsistencyFollowUpChildStateData,
): ConsistencyResolutionCoverageSummary {
  return {
    aggregateCoverage: cloneAggregateOutput(stateData.aggregateOutput),
    executedStageCount: stateData.executedStages.length,
    executedStageIds: stateData.executedStages.map((stage) => stage.stageId),
    executedStages: stateData.executedStages.map((stage, index) => ({
      order: index + 1,
      stageId: stage.stageId,
      promptTemplateId: stage.templateId,
      outputSchemaId: stage.outputSchema,
      output: cloneStageOutput(stage.output),
    })),
  };
}

function coerceStateData(data: unknown): ConsistencyFollowUpChildStateData {
  if (!data || typeof data !== 'object') {
    throw new Error(
      'Child state data is required for ExecutePromptLayer, PlanResolution, and Done',
    );
  }

  const candidate = data as Partial<ConsistencyFollowUpChildStateData>;
  if (
    typeof candidate.stageIndex !== 'number' ||
    !candidate.aggregateOutput ||
    !Array.isArray(candidate.seenBlockingIssueIds) ||
    !Array.isArray(candidate.seenActionableItemIds) ||
    !Array.isArray(candidate.seenFollowUpQuestionIds) ||
    !Array.isArray(candidate.executedStages)
  ) {
    throw new Error('Invalid child state data');
  }

  // Origin-tracking fields are optional for backwards compatibility during
  // state deserialisation; default to empty arrays when absent.
  if (!Array.isArray(candidate.seenActionableItemOrigins)) {
    candidate.seenActionableItemOrigins = [];
  }
  if (!Array.isArray(candidate.seenFollowUpQuestionOrigins)) {
    candidate.seenFollowUpQuestionOrigins = [];
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

async function runPlanResolution(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  input: ConsistencyFollowUpChildInput,
  stateData: ConsistencyFollowUpChildStateData,
): Promise<ConsistencyCheckOutput> {
  if (stateData.executedStages.length === 0) {
    throw new Error('PlanResolution requires at least one executed prompt layer');
  }

  const request = {
    ...buildDelegationRequest(
      TEMPLATE_IDS.consistencyResolution,
      {
        request: input.request,
        specPath: input.specPath,
        constraintsJson: JSON.stringify(input.constraints),
        loopCount: String(input.loopCount),
        remainingQuestionIdsJson: JSON.stringify(input.remainingQuestionIds),
        coverageSummaryJson: JSON.stringify(buildConsistencyResolutionCoverageSummary(stateData)),
      },
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
      input.copilotPromptOptions,
    ),
    outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
  };

  emitDelegationStarted(ctx, {
    state: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
    promptTemplateId: TEMPLATE_IDS.consistencyResolution,
    outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
    childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
    stageId: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
  });

  const result = await delegateToCopilot<ConsistencyCheckOutput>(ctx, request);
  const validation = createSpecDocValidator().validateParsed<ConsistencyCheckOutput>(
    result.structuredOutput,
    SCHEMA_IDS.consistencyCheckOutput,
  );

  if (!validation.ok) {
    throw new Error(
      `[${CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE}] Output schema validation failed: ` +
        `${validation.error.details} (schema: ${validation.error.schemaId})`,
    );
  }

  const output = validation.value;
  const finalViolations = validateConsistencyCheckOutputContract(output);
  if (finalViolations.length > 0) {
    throw new Error(
      `[${CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE}] Contract violation: ` +
        finalViolations.join('; '),
    );
  }

  return output;
}

function mergeStageOutput(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  stateData: ConsistencyFollowUpChildStateData,
  layer: ConsistencyFollowUpPromptLayer,
  stageOutput: ConsistencyStageOutput,
): ConsistencyFollowUpChildStateData {
  const aggregate = cloneAggregateOutput(stateData.aggregateOutput);
  const seenBlockingIssueIds = createStateDataSet(stateData.seenBlockingIssueIds);
  const seenActionableIds = createStateDataSet(stateData.seenActionableItemIds);
  const seenQuestionIds = createStateDataSet(stateData.seenFollowUpQuestionIds);
  const actionableItemOrigins = new Map<string, string>(stateData.seenActionableItemOrigins);
  const followUpQuestionOrigins = new Map<string, string>(stateData.seenFollowUpQuestionOrigins);
  const executedStages = cloneExecutedStages(stateData.executedStages);

  pushUniqueBlockingIssues(aggregate, seenBlockingIssueIds, stageOutput);
  aggregate.readinessChecklist = mergeReadinessChecklist(
    aggregate.readinessChecklist,
    stageOutput.readinessChecklist,
    layer.checklistKeys,
  );

  for (const item of stageOutput.actionableItems) {
    if (seenActionableIds.has(item.itemId)) {
      emitDuplicateSkipped(ctx, {
        state: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        duplicateId: item.itemId,
        idType: 'itemId',
        producingStageId: layer.stageId,
        originStageId: actionableItemOrigins.get(item.itemId) ?? 'unknown',
        childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      });
      continue;
    }
    seenActionableIds.add(item.itemId);
    actionableItemOrigins.set(item.itemId, layer.stageId);
    aggregate.actionableItems.push(item);
  }

  for (const question of stageOutput.followUpQuestions) {
    if (seenQuestionIds.has(question.questionId)) {
      emitDuplicateSkipped(ctx, {
        state: CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        duplicateId: question.questionId,
        idType: 'questionId',
        producingStageId: layer.stageId,
        originStageId: followUpQuestionOrigins.get(question.questionId) ?? 'unknown',
        childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      });
      continue;
    }
    seenQuestionIds.add(question.questionId);
    followUpQuestionOrigins.set(question.questionId, layer.stageId);
    aggregate.followUpQuestions.push(question);
  }

  executedStages.push({
    stageId: layer.stageId,
    templateId: layer.templateId,
    outputSchema: layer.outputSchema,
    output: cloneStageOutput(stageOutput),
  });

  return {
    stageIndex: stateData.stageIndex + 1,
    aggregateOutput: aggregate,
    seenBlockingIssueIds: [...seenBlockingIssueIds],
    seenActionableItemIds: [...seenActionableIds],
    seenFollowUpQuestionIds: [...seenQuestionIds],
    seenActionableItemOrigins: [...actionableItemOrigins.entries()],
    seenFollowUpQuestionOrigins: [...followUpQuestionOrigins.entries()],
    executedStages,
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
      const nextStateData = mergeStageOutput(ctx, stateData, layer, stageOutput);
      const lastStageCompleted = nextStateData.stageIndex >= layers.length;

      ctx.transition(
        lastStageCompleted
          ? CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE
          : CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
        nextStateData,
      );
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

function createPlanResolutionHandler(
  _layers: readonly ConsistencyFollowUpPromptLayer[],
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>['states'][string] {
  return async (ctx, data) => {
    try {
      const stateData = coerceStateData(data);
      const output = await runPlanResolution(ctx, ctx.input, stateData);
      const nextStateData = cloneChildStateData(stateData);
      nextStateData.finalOutput = cloneAggregateOutput(output);

      emitConsistencyOutcome(ctx, {
        state: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
        blockingIssuesCount: output.blockingIssues.length,
        actionableItemsCount: output.actionableItems.length,
        followUpQuestionsCount: output.followUpQuestions.length,
        passNumber: ctx.input.loopCount,
        promptTemplateId: TEMPLATE_IDS.consistencyResolution,
        childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
        stageId: CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
        stageSequence: stateData.executedStages.map((stage) => stage.stageId),
      });

      ctx.transition(CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE, nextStateData);
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

function createDoneHandler(
  _layers: readonly ConsistencyFollowUpPromptLayer[],
): WorkflowDefinition<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>['states'][string] {
  return async (ctx, data) => {
    try {
      const stateData = coerceStateData(data);
      if (!stateData.finalOutput) {
        throw new Error('Done requires a final PlanResolution output');
      }

      const aggregateValidation = createSpecDocValidator().validateParsed<ConsistencyCheckOutput>(
        stateData.finalOutput,
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
    layers.length + 4,
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
      [CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE]: createPlanResolutionHandler(layers),
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
