/**
 * ExpandQuestionWithClarification state handler for `app-builder.spec-doc.v1`.
 *
 * Delegates to `spec-doc.expand-clarification.v1`, validates the output
 * against `clarification-follow-up-output.schema.json`, assigns
 * `kind: "issue-resolution"` to the generated follow-up, validates Pros/Cons
 * content in option descriptions, inserts the follow-up as the immediate next
 * queue item (at `currentIndex + 1`), and transitions to
 * `NumberedOptionsHumanRequest`.
 *
 * Spec references: sections 6.2, 6.3, 6.4, 7.1, 7.2.4.
 * Behaviors: B-SD-TRANS-010, B-SD-QUEUE-002, B-SD-QUEUE-003, B-SD-QUEUE-005,
 *   B-SD-SCHEMA-005.
 *
 * @module spec-doc/states/expand-question-with-clarification
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type {
  ClarificationFollowUpOutput,
  NumberedQuestionItem,
  QuestionQueueItem,
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
} from '../contracts.js';
import { buildDelegationRequest, delegateToCopilot } from '../copilot-delegation.js';
import { emitDelegationStarted, emitClarificationGenerated } from '../observability.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { insertImmediateNext } from '../queue.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

// ---------------------------------------------------------------------------
// State name constant
// ---------------------------------------------------------------------------

export const EXPAND_QUESTION_WITH_CLARIFICATION_STATE = 'ExpandQuestionWithClarification' as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that all option `description` fields include `Pros:` and `Cons:`
 * content as required by spec section 7.2.4.
 *
 * Returns an array of violation messages (empty when all valid).
 */
function validateProsConsDescriptions(question: NumberedQuestionItem): string[] {
  const violations: string[] = [];
  for (const option of question.options) {
    if (!option.description) {
      violations.push(`Option ${option.id}: missing description`);
      continue;
    }
    if (!option.description.includes('Pros:')) {
      violations.push(`Option ${option.id}: description missing "Pros:" content`);
    }
    if (!option.description.includes('Cons:')) {
      violations.push(`Option ${option.id}: description missing "Cons:" content`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `ExpandQuestionWithClarification` state.
 *
 * Entered after `ClassifyCustomPrompt` determines the user's custom text is
 * a clarifying question. The `pendingClarification` field in state data
 * carries the source question context and clarifying text.
 *
 * On success the handler:
 * 1. Assigns `kind: "issue-resolution"` to the follow-up (workflow authority).
 * 2. Validates Pros/Cons content in option descriptions.
 * 3. Validates that `followUpQuestion.questionId` is distinct from the source.
 * 4. Inserts the follow-up at `queueIndex` (immediate-next position).
 * 5. Clears `pendingClarification` and transitions to `NumberedOptionsHumanRequest`.
 */
export async function handleExpandQuestionWithClarification(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  // ---------------------------------------------------------------------------
  // Resolve pending clarification context
  // ---------------------------------------------------------------------------
  const pending = stateData.pendingClarification;
  if (!pending) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] No pendingClarification in state data – ` +
          'cannot determine source question or clarifying text.',
      ),
    );
    return;
  }

  const { sourceQuestionId, clarifyingQuestionText } = pending;

  // Find the source question in the queue for context
  const sourceQuestion = stateData.queue.find((q) => q.questionId === sourceQuestionId);
  if (!sourceQuestion) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Source question "${sourceQuestionId}" not found in queue.`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Delegate to copilot for clarification expansion
  // ---------------------------------------------------------------------------

  // Count existing questions derived from the same source to compute ordinal hint
  const existingClarifications = stateData.queue.filter(
    (q) => q.questionId.startsWith(sourceQuestionId) && q.questionId !== sourceQuestionId,
  );
  const nextQuestionOrdinal = String(existingClarifications.length + 1);

  const variables: Record<string, string> = {
    sourceQuestionId,
    sourceQuestionPrompt: sourceQuestion.prompt,
    sourceOptionsJson: JSON.stringify(sourceQuestion.options),
    clarifyingQuestionText,
    nextQuestionOrdinal,
  };

  const request = buildDelegationRequest(
    TEMPLATE_IDS.expandClarification,
    variables,
    EXPAND_QUESTION_WITH_CLARIFICATION_STATE,
    ctx.input.copilotPromptOptions,
  );

  // SD-OBS-003: emit delegation traceability event
  emitDelegationStarted(ctx, {
    state: EXPAND_QUESTION_WITH_CLARIFICATION_STATE,
    promptTemplateId: TEMPLATE_IDS.expandClarification,
    outputSchemaId: SCHEMA_IDS.clarificationFollowUpOutput,
  });

  let result;
  try {
    result = await delegateToCopilot<ClarificationFollowUpOutput>(ctx, request);
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(
            `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Delegation failed: ${String(err)}`,
          ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate output against clarification-follow-up-output.schema.json
  // ---------------------------------------------------------------------------
  const validator = createSpecDocValidator();
  const validation = validator.validateParsed<ClarificationFollowUpOutput>(
    result.structuredOutput,
    SCHEMA_IDS.clarificationFollowUpOutput,
  );

  if (!validation.ok) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Output schema validation failed: ` +
          `${validation.error.details} (schema: ${validation.error.schemaId})`,
      ),
    );
    return;
  }

  const output = validation.value;
  const rawFollowUp = output.followUpQuestion;

  // ---------------------------------------------------------------------------
  // Workflow-assigned kind: "issue-resolution" (before queue insertion)
  // ---------------------------------------------------------------------------
  const followUp: NumberedQuestionItem = {
    questionId: rawFollowUp.questionId,
    kind: 'issue-resolution',
    prompt: rawFollowUp.prompt,
    options: rawFollowUp.options,
  };

  // ---------------------------------------------------------------------------
  // Validate Pros/Cons in option descriptions (spec section 7.2.4)
  // ---------------------------------------------------------------------------
  const prosConsViolations = validateProsConsDescriptions(followUp);
  if (prosConsViolations.length > 0) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Option description Pros/Cons validation failed: ` +
          prosConsViolations.join('; '),
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate questionId is distinct from source (deterministic but new)
  // ---------------------------------------------------------------------------
  if (followUp.questionId === sourceQuestionId) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Follow-up questionId "${followUp.questionId}" ` +
          `must be distinct from source questionId "${sourceQuestionId}".`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // SD-CUSTOM-004: Insert follow-up as immediate-next queue item
  // queueIndex is already pointing past the answered question, so the
  // follow-up is inserted at the current queueIndex position.
  // ---------------------------------------------------------------------------
  const insertIndex = stateData.queueIndex;
  const queueItem: QuestionQueueItem = {
    ...followUp,
    answered: false,
  };

  const updatedQueue = insertImmediateNext(stateData.queue, insertIndex, queueItem);

  const updatedStateData: SpecDocStateData = {
    ...stateData,
    queue: updatedQueue,
    // queueIndex stays the same – the inserted item IS the next item to ask
    pendingClarification: undefined,
  };

  // SD-OBS-002: emit clarification generated event
  emitClarificationGenerated(ctx, {
    state: EXPAND_QUESTION_WITH_CLARIFICATION_STATE,
    sourceQuestionId,
    followUpQuestionId: followUp.questionId,
    insertIndex,
    promptTemplateId: TEMPLATE_IDS.expandClarification,
  });

  // Transition to NumberedOptionsHumanRequest to ask the follow-up
  ctx.transition('NumberedOptionsHumanRequest', updatedStateData);
}
