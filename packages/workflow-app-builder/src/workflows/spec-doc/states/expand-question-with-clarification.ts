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
import {
  emitDelegationStarted,
  emitClarificationGenerated,
  emitResearchResultLogged,
} from '../observability.js';
import { TEMPLATE_IDS } from '../prompt-templates.js';
import { insertImmediateNext } from '../queue.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';
import {
  findMatchingResearchNote,
  peekDeferredQuestionId,
  type SpecDocStateData,
  createInitialStateData,
} from '../state-data.js';

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
 * a question intent. The `pendingClarification` field in state data
 * carries the source question context and normalized question text.
 *
 * On success the handler:
 * 1. Branches only from `structuredOutput.researchOutcome`.
 * 2. Records research-only outcomes in `researchNotes` when no follow-up is needed.
 * 3. Assigns `kind: "issue-resolution"` to generated follow-ups (workflow authority).
 * 4. Validates Pros/Cons content in option descriptions.
 * 5. Validates that `followUpQuestion.questionId` is distinct from the source.
 * 6. Inserts follow-ups at `queueIndex` (immediate-next position).
 * 7. Clears `pendingClarification` and transitions to `NumberedOptionsHumanRequest`.
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

  const { sourceQuestionId, customQuestionText, intent } = pending;

  // Find the source question in the queue for context
  const sourceQuestionIndex = stateData.queue.findIndex((q) => q.questionId === sourceQuestionId);
  const sourceQuestion =
    sourceQuestionIndex >= 0 ? stateData.queue[sourceQuestionIndex] : undefined;
  if (!sourceQuestion) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] Source question "${sourceQuestionId}" not found in queue.`,
      ),
    );
    return;
  }

  const cachedResearchNote = findMatchingResearchNote(stateData.researchNotes, {
    sourceQuestionId,
    questionText: customQuestionText,
  });

  if (cachedResearchNote) {
    const deferredQuestionId = peekDeferredQuestionId(stateData.deferredQuestionIds);
    const resumeIndex =
      deferredQuestionId === sourceQuestionId ? sourceQuestionIndex : stateData.queueIndex;

    const updatedStateData: SpecDocStateData = {
      ...stateData,
      queueIndex: resumeIndex,
      pendingClarification: undefined,
    };

    ctx.log({
      level: 'info',
      message:
        'Reusing cached research result for repeated clarification instead of delegating again',
      payload: {
        sourceQuestionId,
        cachedIntent: cachedResearchNote.intent,
        requestedIntent: intent,
        questionText: customQuestionText,
      },
    });

    ctx.transition('NumberedOptionsHumanRequest', updatedStateData);
    return;
  }

  // ---------------------------------------------------------------------------
  // Delegate to copilot for clarification expansion
  // ---------------------------------------------------------------------------

  const variables: Record<string, string> = {
    request: ctx.input.request,
    specPath: stateData.artifacts.specPath ?? '',
    sourceQuestionId,
    sourceQuestionPrompt: sourceQuestion.prompt,
    sourceOptionsJson: JSON.stringify(sourceQuestion.options),
    customQuestionText,
    intent,
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

  if (output.researchOutcome === 'resolved-with-research') {
    const deferredQuestionId = peekDeferredQuestionId(stateData.deferredQuestionIds);
    const resumeIndex =
      deferredQuestionId === sourceQuestionId ? sourceQuestionIndex : stateData.queueIndex;

    const updatedStateData: SpecDocStateData = {
      ...stateData,
      queueIndex: resumeIndex,
      researchNotes: [
        ...stateData.researchNotes,
        {
          sourceQuestionId,
          intent,
          questionText: customQuestionText,
          researchSummary: output.researchSummary,
          recordedAt: ctx.now().toISOString(),
        },
      ],
      pendingClarification: undefined,
    };

    emitResearchResultLogged(ctx, {
      state: EXPAND_QUESTION_WITH_CLARIFICATION_STATE,
      sourceQuestionId,
      intent,
      researchOutcome: output.researchOutcome,
      researchSummary: output.researchSummary,
      promptTemplateId: TEMPLATE_IDS.expandClarification,
    });

    ctx.transition('NumberedOptionsHumanRequest', updatedStateData);
    return;
  }

  const rawFollowUp = output.followUpQuestion;
  if (!rawFollowUp) {
    ctx.fail(
      new Error(
        `[${EXPAND_QUESTION_WITH_CLARIFICATION_STATE}] researchOutcome requires followUpQuestion when human input is still needed.`,
      ),
    );
    return;
  }

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
