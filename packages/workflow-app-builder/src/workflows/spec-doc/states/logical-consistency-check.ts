/**
 * LogicalConsistencyCheckCreateFollowUpQuestions state handler for
 * `app-builder.spec-doc.v1`.
 *
 * Delegates to `spec-doc.consistency-check.v1`, validates the output against
 * `consistency-check-output.schema.json`, validates that option descriptions
 * include Pros/Cons content, builds a deterministic question queue, increments
 * `consistencyCheckPasses`, and always transitions to
 * `NumberedOptionsHumanRequest`.
 *
 * Spec references: sections 6.2, 6.3, 6.4, 7.1, 7.2.2, 10.1.
 * Behaviors: B-SD-TRANS-003, B-SD-TRANS-011, B-SD-QUEUE-001,
 *   B-SD-SCHEMA-004, B-SD-SCHEMA-006.
 *
 * @module spec-doc/states/logical-consistency-check
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  ConsistencyCheckOutput,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../contracts.js';
import { buildDelegationRequest, delegateToCopilot } from '../copilot-delegation.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { buildQuestionQueue } from '../queue.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

// ---------------------------------------------------------------------------
// State name constant
// ---------------------------------------------------------------------------

export const LOGICAL_CONSISTENCY_CHECK_STATE =
  'LogicalConsistencyCheckCreateFollowUpQuestions' as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that all option `description` fields across follow-up questions
 * include concise `Pros:` and `Cons:` content as required by spec section 6.4.
 *
 * Returns an array of violation messages (empty when all valid).
 */
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

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `LogicalConsistencyCheckCreateFollowUpQuestions` state.
 *
 * 1. Builds interpolation variables including `{{remainingQuestionIdsJson}}`
 *    sourced from persisted integration output in state data.
 * 2. Delegates to `spec-doc.consistency-check.v1` via the copilot prompt child.
 * 3. Validates the output against `consistency-check-output.schema.json`.
 * 4. Validates that generated option descriptions include Pros/Cons content.
 * 5. Builds a deterministic question queue (sorted by `questionId`).
 * 6. Synthesizes a completion-confirmation question when follow-ups are empty.
 * 7. Increments `consistencyCheckPasses`.
 * 8. **Always** transitions to `NumberedOptionsHumanRequest` (hardcoded target).
 */
export async function handleLogicalConsistencyCheck(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  // SD-CHECK-006: remainingQuestionIdsJson sourced from persisted integration output
  const remainingQuestionIds =
    stateData.artifacts.lastIntegrationOutput?.remainingQuestionIds ?? [];

  // Build interpolation variables for the consistency-check prompt template
  const variables: Record<string, string> = {
    request: ctx.input.request,
    specPath: stateData.artifacts.specPath ?? '',
    constraintsJson: JSON.stringify(ctx.input.constraints ?? []),
    loopCount: String(stateData.counters.consistencyCheckPasses),
    remainingQuestionIdsJson: JSON.stringify(remainingQuestionIds),
  };

  const request = buildDelegationRequest(
    TEMPLATE_IDS.consistencyCheck,
    variables,
    LOGICAL_CONSISTENCY_CHECK_STATE,
    ctx.input.copilotPromptOptions,
  );

  // Delegate to copilot prompt child workflow
  let result;
  try {
    result = await delegateToCopilot<ConsistencyCheckOutput>(ctx, request);
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(`[${LOGICAL_CONSISTENCY_CHECK_STATE}] Delegation failed: ${String(err)}`),
    );
    return;
  }

  // SD-CHECK-004: validate output against consistency-check-output.schema.json
  const validator = createSpecDocValidator();
  const validation = validator.validateParsed<ConsistencyCheckOutput>(
    result.structuredOutput,
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

  const output = validation.value;

  // SD-CHECK-007: validate option descriptions include Pros: and Cons:
  const prosConsViolations = validateProsConsDescriptions(output);
  if (prosConsViolations.length > 0) {
    ctx.fail(
      new Error(
        `[${LOGICAL_CONSISTENCY_CHECK_STATE}] Option description Pros/Cons validation failed: ` +
          prosConsViolations.join('; '),
      ),
    );
    return;
  }

  // SD-CHECK-002 / SD-CHECK-003: build deterministic queue (sorts + synthesizes completion)
  const queue = buildQuestionQueue(output.followUpQuestions);

  // SD-CHECK-005: increment consistencyCheckPasses
  const updatedStateData: SpecDocStateData = {
    ...stateData,
    queue,
    counters: {
      ...stateData.counters,
      consistencyCheckPasses: stateData.counters.consistencyCheckPasses + 1,
    },
  };

  ctx.log({
    level: 'info',
    message: `LogicalConsistencyCheck pass ${updatedStateData.counters.consistencyCheckPasses} complete`,
    payload: {
      blockingIssuesCount: output.blockingIssues.length,
      followUpQuestionsCount: output.followUpQuestions.length,
      queueSize: queue.length,
      readinessChecklist: output.readinessChecklist,
      remainingQuestionIdsFromIntegration: remainingQuestionIds,
    },
  });

  // SD-CHECK-001: transition target is ALWAYS NumberedOptionsHumanRequest
  ctx.transition('NumberedOptionsHumanRequest', updatedStateData);
}
