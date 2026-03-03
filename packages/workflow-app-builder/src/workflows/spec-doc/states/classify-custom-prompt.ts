/**
 * ClassifyCustomPrompt state handler for `app-builder.spec-doc.v1`.
 *
 * Delegates to `spec-doc.classify-custom-prompt.v1`, validates intent output
 * against `custom-prompt-classification-output.schema.json`, and routes based
 * on `structuredOutput.intent`:
 *
 *  - `custom-answer`  → buffers custom answer text with current answer set,
 *    transitions back to `NumberedOptionsHumanRequest`.
 *  - `clarifying-question` → transitions to `ExpandQuestionWithClarification`
 *    carrying the clarifying text for follow-up generation.
 *
 * Spec references: sections 6.2, 6.3, 6.4, 7.1, 7.2.3.
 * Behaviors: B-SD-TRANS-005, B-SD-TRANS-008, B-SD-TRANS-009,
 *   B-SD-SCHEMA-005.
 *
 * @module spec-doc/states/classify-custom-prompt
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  CustomPromptClassificationOutput,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../contracts.js';
import { appendAnswer, createNormalizedAnswer } from '../answers.js';
import { buildDelegationRequest, delegateToCopilot } from '../copilot-delegation.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

// ---------------------------------------------------------------------------
// State name constant
// ---------------------------------------------------------------------------

export const CLASSIFY_CUSTOM_PROMPT_STATE = 'ClassifyCustomPrompt' as const;

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `ClassifyCustomPrompt` state.
 *
 * The handler is entered when `NumberedOptionsHumanRequest` detected custom
 * text in a feedback response. The most recent answer in `normalizedAnswers`
 * contains the custom `text` and the `selectedOptionIds` for the question
 * that triggered routing here. The `queueIndex` has already been advanced
 * past the answered question.
 *
 * On success the handler inspects only `structuredOutput.intent`
 * (SD-CUSTOM-002) and routes accordingly.
 */
export async function handleClassifyCustomPrompt(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  // ---------------------------------------------------------------------------
  // Resolve context from the most recent answer (the one with custom text)
  // ---------------------------------------------------------------------------
  const lastAnswer = stateData.normalizedAnswers[stateData.normalizedAnswers.length - 1];
  if (!lastAnswer) {
    ctx.fail(
      new Error(
        `[${CLASSIFY_CUSTOM_PROMPT_STATE}] No answers in state data – ` +
          'cannot determine which question triggered custom prompt routing.',
      ),
    );
    return;
  }

  // The source question is the one whose answer contains custom text.
  // It is at queueIndex - 1 (index was advanced by NumberedOptionsHumanRequest).
  const sourceQueueIndex = stateData.queueIndex - 1;
  const sourceQuestion = stateData.queue[sourceQueueIndex];
  if (!sourceQuestion) {
    ctx.fail(
      new Error(
        `[${CLASSIFY_CUSTOM_PROMPT_STATE}] Source question at index ${sourceQueueIndex} not found in queue.`,
      ),
    );
    return;
  }

  const customText = lastAnswer.text ?? '';

  // ---------------------------------------------------------------------------
  // Delegate to copilot classification
  // ---------------------------------------------------------------------------
  const variables: Record<string, string> = {
    questionId: sourceQuestion.questionId,
    questionPrompt: sourceQuestion.prompt,
    selectedOptionIdsJson: JSON.stringify(lastAnswer.selectedOptionIds),
    customText,
  };

  const request = buildDelegationRequest(
    TEMPLATE_IDS.classifyCustomPrompt,
    variables,
    CLASSIFY_CUSTOM_PROMPT_STATE,
    ctx.input.copilotPromptOptions,
  );

  let result;
  try {
    result = await delegateToCopilot<CustomPromptClassificationOutput>(ctx, request);
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(`[${CLASSIFY_CUSTOM_PROMPT_STATE}] Delegation failed: ${String(err)}`),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate output against custom-prompt-classification-output.schema.json
  // ---------------------------------------------------------------------------
  const validator = createSpecDocValidator();
  const validation = validator.validateParsed<CustomPromptClassificationOutput>(
    result.structuredOutput,
    SCHEMA_IDS.customPromptClassificationOutput,
  );

  if (!validation.ok) {
    ctx.fail(
      new Error(
        `[${CLASSIFY_CUSTOM_PROMPT_STATE}] Output schema validation failed: ` +
          `${validation.error.details} (schema: ${validation.error.schemaId})`,
      ),
    );
    return;
  }

  const output = validation.value;

  // ---------------------------------------------------------------------------
  // SD-CUSTOM-002: Intent routing authority is ONLY `structuredOutput.intent`
  // ---------------------------------------------------------------------------

  if (output.intent === 'custom-answer') {
    // SD-CUSTOM-003: Buffer custom answer text with the current answer set.
    // The custom answer text from classification is appended as a supplementary
    // normalized-answer record, preserving the original answer immutably.
    const bufferedAnswer = createNormalizedAnswer(
      sourceQuestion.questionId,
      lastAnswer.selectedOptionIds,
      ctx.now().toISOString(),
      output.customAnswerText,
    );
    const updatedAnswers = appendAnswer(stateData.normalizedAnswers, bufferedAnswer);

    const updatedStateData: SpecDocStateData = {
      ...stateData,
      normalizedAnswers: updatedAnswers,
    };

    ctx.log({
      level: 'info',
      message: `Custom text classified as custom-answer for "${sourceQuestion.questionId}", buffering and resuming queue`,
      payload: {
        questionId: sourceQuestion.questionId,
        intent: output.intent,
      },
    });

    ctx.transition('NumberedOptionsHumanRequest', updatedStateData);
    return;
  }

  if (output.intent === 'clarifying-question') {
    // SD-CUSTOM-004: route to ExpandQuestionWithClarification carrying clarifying text
    ctx.log({
      level: 'info',
      message: `Custom text classified as clarifying-question for "${sourceQuestion.questionId}", routing to ExpandQuestionWithClarification`,
      payload: {
        questionId: sourceQuestion.questionId,
        intent: output.intent,
        clarifyingQuestionText: output.clarifyingQuestionText,
      },
    });

    // Pass clarifyingQuestionText through state data for the next handler.
    const updatedStateData: SpecDocStateData = {
      ...stateData,
      pendingClarification: {
        sourceQuestionId: sourceQuestion.questionId,
        clarifyingQuestionText: output.clarifyingQuestionText!,
      },
    };

    ctx.transition('ExpandQuestionWithClarification', updatedStateData);
    return;
  }

  // Unreachable if schema validation passed, but guard defensively.
  ctx.fail(
    new Error(`[${CLASSIFY_CUSTOM_PROMPT_STATE}] Unrecognized intent: "${String(output.intent)}"`),
  );
}
