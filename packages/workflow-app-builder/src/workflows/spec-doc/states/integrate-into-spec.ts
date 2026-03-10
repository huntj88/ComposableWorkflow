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
  IntegrateIntoSpecInput,
  IntegrateIntoSpecSource,
  NormalizedAnswer,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
  SpecIntegrationOutput,
  SpecActionableItem,
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

interface IntegrateIntoSpecStateOverrides {
  source?: IntegrateIntoSpecSource;
  actionableItems?: SpecActionableItem[];
}

type IntegrateIntoSpecStatePayload = SpecDocStateData & IntegrateIntoSpecStateOverrides;

function resolveIntegrationSource(
  stateData: SpecDocStateData,
  payload: unknown,
): IntegrateIntoSpecSource {
  const explicitSource = (payload as IntegrateIntoSpecStateOverrides | undefined)?.source;

  if (
    explicitSource === 'workflow-input' ||
    explicitSource === 'numbered-options-feedback' ||
    explicitSource === 'consistency-action-items' ||
    explicitSource === 'consistency-action-items-with-feedback'
  ) {
    return explicitSource;
  }

  return stateData.normalizedAnswers.length === 0 ? 'workflow-input' : 'numbered-options-feedback';
}

function buildIntegrateIntoSpecInput(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  stateData: SpecDocStateData,
  payload: unknown,
): IntegrateIntoSpecInput {
  const source = resolveIntegrationSource(stateData, payload);
  const specPath =
    stateData.artifacts.specPath ??
    (source === 'workflow-input' ? (ctx.input.targetPath ?? '') : '');

  const baseInput = {
    source,
    request: ctx.input.request,
    ...(ctx.input.targetPath !== undefined ? { targetPath: ctx.input.targetPath } : {}),
    ...(ctx.input.constraints !== undefined ? { constraints: ctx.input.constraints } : {}),
    ...(specPath !== '' ? { specPath } : {}),
  };

  if (source === 'numbered-options-feedback') {
    return {
      ...baseInput,
      source,
      answers: stateData.normalizedAnswers,
    };
  }

  if (source === 'consistency-action-items') {
    const actionableItems = (payload as IntegrateIntoSpecStateOverrides | undefined)
      ?.actionableItems;

    if (!Array.isArray(actionableItems)) {
      throw new Error(
        `[${INTEGRATE_INTO_SPEC_STATE}] Missing actionableItems for source "consistency-action-items"`,
      );
    }

    return {
      ...baseInput,
      source,
      actionableItems,
    };
  }

  if (source === 'consistency-action-items-with-feedback') {
    const actionableItems = (payload as IntegrateIntoSpecStateOverrides | undefined)
      ?.actionableItems;

    if (!Array.isArray(actionableItems)) {
      throw new Error(
        `[${INTEGRATE_INTO_SPEC_STATE}] Missing actionableItems for source "consistency-action-items-with-feedback"`,
      );
    }

    return {
      ...baseInput,
      source,
      actionableItems,
      answers: stateData.normalizedAnswers,
    };
  }

  return {
    ...baseInput,
    source,
  };
}

// ---------------------------------------------------------------------------
// Prompt-only enrichment (B-SD-INPUT-006)
// ---------------------------------------------------------------------------

/**
 * Enriched answer shape used exclusively in prompt assembly.
 * Not persisted — `NormalizedAnswer` records remain unchanged.
 */
interface EnrichedPromptAnswer {
  questionId: string;
  questionPrompt: string | null;
  selectedOptionIds: number[];
  selectedOptions: Array<{ id: number; label: string | null }>;
  text?: string;
  answeredAt: string;
}

/**
 * Join each `NormalizedAnswer` with its matching `QuestionQueueItem` to
 * produce enriched prompt context. If a queue item cannot be found for a
 * given `questionId`, `questionPrompt` is `null` and `selectedOptions` is `[]`.
 * If a `selectedOptionId` does not match any option in the queue item,
 * the entry is `{ id, label: null }`.
 */
function enrichAnswersWithContext(
  answers: NormalizedAnswer[],
  queue: QuestionQueueItem[],
): EnrichedPromptAnswer[] {
  const queueMap = new Map(queue.map((q) => [q.questionId, q]));

  return answers.map((answer) => {
    const queueItem = queueMap.get(answer.questionId);

    const enriched: EnrichedPromptAnswer = {
      questionId: answer.questionId,
      questionPrompt: queueItem?.prompt ?? null,
      selectedOptionIds: answer.selectedOptionIds,
      selectedOptions: queueItem
        ? answer.selectedOptionIds.map((optId) => {
            const opt = queueItem.options.find((o) => o.id === optId);
            return { id: optId, label: opt?.label ?? null };
          })
        : [],
      answeredAt: answer.answeredAt,
    };

    if (answer.text !== undefined) {
      enriched.text = answer.text;
    }

    return enriched;
  });
}

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
  const payload: IntegrateIntoSpecStatePayload =
    (data as IntegrateIntoSpecStatePayload | undefined) ?? createInitialStateData();
  const stateData: SpecDocStateData = payload;

  let integrationInput: IntegrateIntoSpecInput;
  try {
    integrationInput = buildIntegrateIntoSpecInput(ctx, stateData, payload);
  } catch (err) {
    ctx.fail(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  // Build interpolation variables for the prompt template
  const variables: Record<string, string> = {
    source: integrationInput.source,
    request: integrationInput.request,
    targetPath: integrationInput.targetPath ?? '',
    constraintsJson: JSON.stringify(integrationInput.constraints ?? []),
    specPath: integrationInput.specPath ?? '',
    answersJson: JSON.stringify(
      enrichAnswersWithContext(integrationInput.answers ?? [], stateData.queue),
    ),
    actionableItemsJson: JSON.stringify(integrationInput.actionableItems ?? []),
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
    source: integrationInput.source,
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
