/**
 * Delegated consistency/follow-up child workflow for `app-builder.spec-doc.v1`.
 *
 * Executes ordered prompt layers, validates each stage against the shared
 * consistency schema, aggregates executed-stage outputs, and short-circuits on
 * actionable items.
 *
 * @module spec-doc/consistency-follow-up-child
 */

import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRegistration,
} from '@composable-workflow/workflow-lib/contracts';

import type {
  ConsistencyCheckOutput,
  ConsistencyFollowUpChildInput,
  ReadinessChecklist,
} from './contracts.js';
import { buildDelegationRequest, delegateToCopilot } from './copilot-delegation.js';
import { emitConsistencyOutcome, emitDelegationStarted } from './observability.js';
import { TEMPLATE_IDS, type PromptTemplateId } from './prompt-templates.js';
import { createSpecDocValidator } from './schema-validation.js';
import { SCHEMA_IDS } from './schemas.js';

export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE =
  'app-builder.spec-doc.consistency-follow-up.v1' as const;
export const CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_VERSION = '1.0.0' as const;

export interface ConsistencyFollowUpPromptLayer {
  stageId: string;
  templateId: PromptTemplateId;
}

export const CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS = [
  { stageId: 'baseline-consistency', templateId: TEMPLATE_IDS.consistencyCheck },
] as const satisfies readonly ConsistencyFollowUpPromptLayer[];

const CHILD_EXECUTION_STATE = 'ExecutePromptLayer' as const;
const CHILD_ACTIONABLE_STATE = 'EmitActionableItems' as const;
const CHILD_FOLLOW_UP_STATE = 'EmitFollowUpQuestions' as const;

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

function mergeReadinessChecklist(
  aggregate: ReadinessChecklist,
  stage: ReadinessChecklist,
): ReadinessChecklist {
  return {
    hasScopeAndObjective: aggregate.hasScopeAndObjective && stage.hasScopeAndObjective,
    hasNonGoals: aggregate.hasNonGoals && stage.hasNonGoals,
    hasConstraintsAndAssumptions:
      aggregate.hasConstraintsAndAssumptions && stage.hasConstraintsAndAssumptions,
    hasInterfacesOrContracts: aggregate.hasInterfacesOrContracts && stage.hasInterfacesOrContracts,
    hasTestableAcceptanceCriteria:
      aggregate.hasTestableAcceptanceCriteria && stage.hasTestableAcceptanceCriteria,
    hasNoContradictions: aggregate.hasNoContradictions && stage.hasNoContradictions,
    hasSufficientDetail: aggregate.hasSufficientDetail && stage.hasSufficientDetail,
  };
}

function pushUniqueBlockingIssues(
  aggregate: ConsistencyCheckOutput,
  seenBlockingIssueIds: Set<string>,
  stageOutput: ConsistencyCheckOutput,
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
  for (const layer of layers) {
    if (layer.stageId.trim().length === 0) {
      throw new Error('Prompt layer stageId must be non-empty');
    }
    if (seenStageIds.has(layer.stageId)) {
      throw new Error(`Duplicate prompt-layer stageId: ${layer.stageId}`);
    }
    seenStageIds.add(layer.stageId);
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

function validateProsConsDescriptions(output: ConsistencyCheckOutput): string[] {
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

export function validateConsistencyCheckOutputContract(output: ConsistencyCheckOutput): string[] {
  const violations: string[] = [];

  if (output.actionableItems.length > 0 && output.followUpQuestions.length > 0) {
    violations.push('actionableItems and followUpQuestions must be mutually exclusive');
  }

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

  violations.push(...validateProsConsDescriptions(output));
  return violations;
}

function buildEmptyAggregate(): ConsistencyCheckOutput {
  return {
    blockingIssues: [],
    actionableItems: [],
    followUpQuestions: [],
    readinessChecklist: cloneDefaultReadinessChecklist(),
  };
}

export async function executeConsistencyFollowUpPromptLayers(
  ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>,
  input: ConsistencyFollowUpChildInput,
  layers: readonly ConsistencyFollowUpPromptLayer[] = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
): Promise<ConsistencyCheckOutput> {
  const inputViolations = validateConsistencyFollowUpChildInput(input);
  if (inputViolations.length > 0) {
    throw new Error(`Invalid child input: ${inputViolations.join('; ')}`);
  }

  if (layers.length === 0) {
    throw new Error('CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS must contain at least one stage');
  }
  ensureUniqueStageIds(layers);

  const validator = createSpecDocValidator();
  const aggregate = buildEmptyAggregate();
  const seenBlockingIssueIds = new Set<string>();
  const seenActionableIds = new Set<string>();
  const seenQuestionIds = new Set<string>();

  for (const layer of layers) {
    const request = buildDelegationRequest(
      layer.templateId,
      {
        request: input.request,
        specPath: input.specPath,
        constraintsJson: JSON.stringify(input.constraints),
        loopCount: String(input.loopCount),
        remainingQuestionIdsJson: JSON.stringify(input.remainingQuestionIds),
        stageId: layer.stageId,
      },
      CHILD_EXECUTION_STATE,
      input.copilotPromptOptions,
    );

    emitDelegationStarted(ctx, {
      state: CHILD_EXECUTION_STATE,
      promptTemplateId: layer.templateId,
      outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
      childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      stageId: layer.stageId,
    });

    const result = await delegateToCopilot<ConsistencyCheckOutput>(ctx, request);
    const validation = validator.validateParsed<ConsistencyCheckOutput>(
      result.structuredOutput,
      SCHEMA_IDS.consistencyCheckOutput,
    );

    if (!validation.ok) {
      throw new Error(
        `[${layer.stageId}] Output schema validation failed: ` +
          `${validation.error.details} (schema: ${validation.error.schemaId})`,
      );
    }

    const stageOutput = validation.value;
    const stageViolations = validateConsistencyCheckOutputContract(stageOutput);
    if (stageViolations.length > 0) {
      throw new Error(`[${layer.stageId}] Contract violation: ${stageViolations.join('; ')}`);
    }

    if (stageOutput.actionableItems.length > 0 && aggregate.followUpQuestions.length > 0) {
      throw new Error(
        `[${layer.stageId}] Contract violation: actionableItems cannot appear after followUpQuestions have already been aggregated`,
      );
    }

    pushUniqueBlockingIssues(aggregate, seenBlockingIssueIds, stageOutput);
    aggregate.readinessChecklist = mergeReadinessChecklist(
      aggregate.readinessChecklist,
      stageOutput.readinessChecklist,
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

    if (aggregate.actionableItems.length > 0) {
      emitConsistencyOutcome(ctx, {
        state: CHILD_ACTIONABLE_STATE,
        blockingIssuesCount: aggregate.blockingIssues.length,
        actionableItemsCount: aggregate.actionableItems.length,
        followUpQuestionsCount: 0,
        passNumber: input.loopCount,
        promptTemplateId: layer.templateId,
        childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
        stageId: layer.stageId,
      });

      return {
        ...aggregate,
        followUpQuestions: [],
      };
    }
  }

  const finalViolations = validateConsistencyCheckOutputContract(aggregate);
  if (finalViolations.length > 0) {
    throw new Error(`Aggregate contract violation: ${finalViolations.join('; ')}`);
  }

  const finalLayer = layers[layers.length - 1];
  emitConsistencyOutcome(ctx, {
    state: CHILD_FOLLOW_UP_STATE,
    blockingIssuesCount: aggregate.blockingIssues.length,
    actionableItemsCount: 0,
    followUpQuestionsCount: aggregate.followUpQuestions.length,
    passNumber: input.loopCount,
    promptTemplateId: finalLayer.templateId,
    childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  });

  return {
    ...aggregate,
    actionableItems: [],
  };
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

export function createConsistencyFollowUpChildDefinition(): WorkflowDefinition<
  ConsistencyFollowUpChildInput,
  ConsistencyCheckOutput
> {
  return {
    initialState: 'start',
    states: {
      start: handleConsistencyFollowUpChild,
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
