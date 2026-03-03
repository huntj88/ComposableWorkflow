/**
 * IntegrateIntoSpec state handler for `app-builder.spec-doc.v1`.
 *
 * Builds appropriate input based on first-pass vs feedback-pass, delegates to
 * `spec-doc.integrate.v1`, validates output against
 * `spec-integration-output.schema.json`, persists artifacts and counters,
 * then transitions to `LogicalConsistencyCheckCreateFollowUpQuestions`.
 *
 * Spec references: sections 6.2, 6.5, 7.1, 7.2.1.
 * Behaviors: B-SD-TRANS-001, B-SD-TRANS-002, B-SD-INPUT-001, B-SD-INPUT-002,
 *   B-SD-INPUT-003, B-SD-SCHEMA-001.
 *
 * @module spec-doc/states/integrate-into-spec
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
  SpecIntegrationOutput,
} from '../contracts.js';
import { buildDelegationRequest, delegateToCopilot } from '../copilot-delegation.js';
import { emitDelegationStarted, emitIntegrationPassCompleted } from '../observability.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

// ---------------------------------------------------------------------------
// State name constant
// ---------------------------------------------------------------------------

export const INTEGRATE_INTO_SPEC_STATE = 'IntegrateIntoSpec' as const;

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `IntegrateIntoSpec` state.
 *
 * - First pass (`source: "workflow-input"`): carries `request`, `targetPath`,
 *   and `constraints` from the workflow input.
 * - Feedback pass (`source: "numbered-options-feedback"`): carries normalized
 *   answers and references prior `specPath`.
 *
 * On success the handler increments `integrationPasses`, persists the
 * validated output into `artifacts`, and transitions to the next state.
 * On schema validation failure the run is hard-failed with state context.
 */
export async function handleIntegrateIntoSpec(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  // SD-INT-001 / SD-INT-002: source mode from presence of prior answers
  const isFirstPass = stateData.normalizedAnswers.length === 0;
  const source = isFirstPass ? 'workflow-input' : 'numbered-options-feedback';

  // Build interpolation variables for the prompt template
  const variables: Record<string, string> = {
    source,
    request: ctx.input.request,
    targetPath: ctx.input.targetPath ?? '',
    constraintsJson: JSON.stringify(ctx.input.constraints ?? []),
    specPath: stateData.artifacts.specPath ?? '',
    answersJson: isFirstPass ? '[]' : JSON.stringify(stateData.normalizedAnswers),
  };

  // SD-INT-006: inputSchema provided via buildDelegationRequest (inherits from template)
  const request = buildDelegationRequest(
    TEMPLATE_IDS.integrate,
    variables,
    INTEGRATE_INTO_SPEC_STATE,
    ctx.input.copilotPromptOptions,
  );

  // SD-OBS-003: emit delegation traceability event
  emitDelegationStarted(ctx, {
    state: INTEGRATE_INTO_SPEC_STATE,
    promptTemplateId: TEMPLATE_IDS.integrate,
    outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
    inputSchemaId: SCHEMA_IDS.specIntegrationInput,
  });

  // Delegate to copilot prompt child workflow
  let result;
  try {
    result = await delegateToCopilot<SpecIntegrationOutput>(ctx, request);
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(`[${INTEGRATE_INTO_SPEC_STATE}] Delegation failed: ${String(err)}`),
    );
    return;
  }

  // SD-INT-004: validate output against spec-integration-output.schema.json
  const validator = createSpecDocValidator();
  const validation = validator.validateParsed<SpecIntegrationOutput>(
    result.structuredOutput,
    SCHEMA_IDS.specIntegrationOutput,
  );

  if (!validation.ok) {
    ctx.fail(
      new Error(
        `[${INTEGRATE_INTO_SPEC_STATE}] Output schema validation failed: ` +
          `${validation.error.details} (schema: ${validation.error.schemaId})`,
      ),
    );
    return;
  }

  const output = validation.value;

  // Persist validated output and increment pass counter
  const updatedStateData: SpecDocStateData = {
    ...stateData,
    counters: {
      ...stateData.counters,
      integrationPasses: stateData.counters.integrationPasses + 1,
    },
    artifacts: {
      ...stateData.artifacts,
      specPath: output.specPath,
      lastIntegrationOutput: output,
    },
  };

  // SD-OBS-002: emit integration pass completed event
  emitIntegrationPassCompleted(ctx, {
    state: INTEGRATE_INTO_SPEC_STATE,
    source,
    specPath: output.specPath,
    passNumber: updatedStateData.counters.integrationPasses,
    changeSummaryCount: output.changeSummary.length,
    resolvedCount: output.resolvedQuestionIds.length,
    remainingCount: output.remainingQuestionIds.length,
    promptTemplateId: TEMPLATE_IDS.integrate,
  });

  // Transition to next state with updated persisted data
  ctx.transition('LogicalConsistencyCheckCreateFollowUpQuestions', updatedStateData);
}
