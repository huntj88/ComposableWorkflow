/**
 * LogicalConsistencyCheckCreateFollowUpQuestions state handler for
 * `app-builder.spec-doc.v1`.
 *
 * Delegates to the internal child workflow
 * `app-builder.spec-doc.consistency-follow-up.v1`, validates the aggregate
 * result, increments `consistencyCheckPasses`, and routes either to immediate
 * integration or to human follow-up handling.
 *
 * Spec references: sections 6.2, 6.2.1, 6.3, 7.1, 7.2.2, 10.1.
 * Behaviors: B-SD-TRANS-003, B-SD-TRANS-011, B-SD-CHILD-001,
 *   B-SD-CHILD-002, B-SD-CHILD-003, B-SD-OBS-003.
 *
 * @module spec-doc/states/logical-consistency-check
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  ConsistencyCheckOutput,
  ConsistencyFollowUpChildInput,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../contracts.js';
import {
  CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  validateConsistencyCheckOutputContract,
} from '../consistency-follow-up-child.js';
import { emitDelegationStarted, emitConsistencyOutcome } from '../observability.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { buildQuestionQueue } from '../queue.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

const PARENT_CONSISTENCY_TEMPLATE_ID = TEMPLATE_IDS.consistencyResolution;

export const LOGICAL_CONSISTENCY_CHECK_STATE =
  'LogicalConsistencyCheckCreateFollowUpQuestions' as const;

export async function handleLogicalConsistencyCheck(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  const remainingQuestionIds =
    stateData.artifacts.lastIntegrationOutput?.remainingQuestionIds ?? [];
  const specPath =
    stateData.artifacts.lastIntegrationOutput?.specPath ?? stateData.artifacts.specPath ?? '';

  const childInput: ConsistencyFollowUpChildInput = {
    request: ctx.input.request,
    specPath,
    constraints: ctx.input.constraints ?? [],
    loopCount: stateData.counters.consistencyCheckPasses,
    remainingQuestionIds,
    copilotPromptOptions: ctx.input.copilotPromptOptions,
  };

  emitDelegationStarted(ctx, {
    state: LOGICAL_CONSISTENCY_CHECK_STATE,
    promptTemplateId: PARENT_CONSISTENCY_TEMPLATE_ID,
    outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
    childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  });

  let output: ConsistencyCheckOutput;
  try {
    output = await ctx.launchChild<ConsistencyFollowUpChildInput, ConsistencyCheckOutput>({
      workflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
      input: childInput,
      correlationId: `${LOGICAL_CONSISTENCY_CHECK_STATE}:${CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE}`,
    });
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(
            `[${LOGICAL_CONSISTENCY_CHECK_STATE}] Child workflow delegation failed: ${String(err)}`,
          ),
    );
    return;
  }

  const validation = createSpecDocValidator().validateParsed<ConsistencyCheckOutput>(
    output,
    SCHEMA_IDS.consistencyCheckOutput,
  );

  if (!validation.ok) {
    ctx.fail(
      new Error(
        `[${LOGICAL_CONSISTENCY_CHECK_STATE}] Output schema validation failed: ` +
          `${validation.error.details} (schema: ${validation.error.schemaId})`,
      ),
    );
    return;
  }

  output = validation.value;

  const contractViolations = validateConsistencyCheckOutputContract(output);
  if (contractViolations.length > 0) {
    ctx.fail(
      new Error(
        `[${LOGICAL_CONSISTENCY_CHECK_STATE}] Child aggregate contract validation failed: ` +
          contractViolations.join('; '),
      ),
    );
    return;
  }

  const updatedStateData: SpecDocStateData = {
    ...stateData,
    counters: {
      ...stateData.counters,
      consistencyCheckPasses: stateData.counters.consistencyCheckPasses + 1,
    },
  };

  emitConsistencyOutcome(ctx, {
    state: LOGICAL_CONSISTENCY_CHECK_STATE,
    blockingIssuesCount: output.blockingIssues.length,
    actionableItemsCount: output.actionableItems.length,
    followUpQuestionsCount: output.followUpQuestions.length,
    passNumber: updatedStateData.counters.consistencyCheckPasses,
    promptTemplateId: PARENT_CONSISTENCY_TEMPLATE_ID,
    childWorkflowType: CONSISTENCY_FOLLOW_UP_CHILD_WORKFLOW_TYPE,
  });

  if (output.actionableItems.length > 0) {
    ctx.transition('IntegrateIntoSpec', {
      ...updatedStateData,
      queue: [],
      queueIndex: 0,
      source: 'consistency-action-items',
      actionableItems: output.actionableItems,
    });
    return;
  }

  const queue = buildQuestionQueue(output.followUpQuestions);
  ctx.transition('NumberedOptionsHumanRequest', {
    ...updatedStateData,
    queue,
    queueIndex: 0,
  });
}
