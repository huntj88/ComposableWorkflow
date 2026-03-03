/**
 * NumberedOptionsHumanRequest state handler for `app-builder.spec-doc.v1`.
 *
 * Implements deterministic per-question queue execution: launches exactly one
 * `server.human-feedback.v1` child run per queue item, validates responses,
 * accumulates normalized answers, and resolves the next transition.
 *
 * Spec references: sections 6.2, 6.3, 6.4, 8.
 * Behaviors: B-SD-TRANS-004, B-SD-TRANS-006, B-SD-HFB-001, B-SD-HFB-002,
 *   B-SD-HFB-003, B-SD-HFB-004, B-SD-QUEUE-004.
 *
 * @module spec-doc/states/numbered-options-human-request
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { SpecDocGenerationInput, SpecDocGenerationOutput } from '../contracts.js';
import {
  appendAnswer,
  createNormalizedAnswer,
  validateCompletionConfirmationCardinality,
  validateSelectedOptionIds,
} from '../answers.js';
import { emitQuestionGenerated, emitResponseReceived } from '../observability.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../queue.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NUMBERED_OPTIONS_HUMAN_REQUEST_STATE = 'NumberedOptionsHumanRequest' as const;

/**
 * Workflow type for the server-owned human feedback child workflow.
 * B-SD-HFB-004: consumed via workflow type + schema shape only.
 */
const SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE = 'server.human-feedback.v1';

// ---------------------------------------------------------------------------
// Human Feedback Child Types (contract boundary – no import from server)
// ---------------------------------------------------------------------------

/** Input shape for launching a `server.human-feedback.v1` child run. */
interface HumanFeedbackChildInput {
  prompt: string;
  options: Array<{ id: number; label: string; description?: string }>;
  questionId: string;
  requestedByRunId: string;
  requestedByWorkflowType: string;
  requestedByState?: string;
}

/** Output shape received from a completed `server.human-feedback.v1` child. */
interface HumanFeedbackChildOutput {
  status: 'responded' | 'cancelled';
  response?: {
    questionId: string;
    selectedOptionIds?: number[];
    text?: string;
  };
  respondedAt?: string;
  cancelledAt?: string;
}

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `NumberedOptionsHumanRequest` state.
 *
 * Operates on a deterministic queue index pointer (`queueIndex`) in persisted
 * state data. For each invocation:
 *
 * 1. Resolves the current queue item by index.
 * 2. Launches exactly one `server.human-feedback.v1` child run.
 * 3. Validates the response (option IDs, cardinality).
 * 4. Records the normalized answer on success.
 * 5. Resolves the next transition:
 *    - Custom text → `ClassifyCustomPrompt`
 *    - More items → self-loop (`NumberedOptionsHumanRequest`)
 *    - Queue exhausted + completion confirmed → `Done`
 *    - Queue exhausted + not confirmed → `IntegrateIntoSpec`
 */
export async function handleNumberedOptionsHumanRequest(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): Promise<void> {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  const { queue, queueIndex } = stateData;

  // ---------------------------------------------------------------------------
  // Guard: queue must have items at the current index
  // ---------------------------------------------------------------------------
  if (queue.length === 0 || queueIndex >= queue.length) {
    ctx.fail(
      new Error(
        `[${NUMBERED_OPTIONS_HUMAN_REQUEST_STATE}] Queue is empty or index ${queueIndex} is out of bounds (queue size: ${queue.length})`,
      ),
    );
    return;
  }

  const currentItem = queue[queueIndex];

  // ---------------------------------------------------------------------------
  // SD-HRQ-001: Launch exactly one feedback child run per queue item
  // ---------------------------------------------------------------------------
  const childInput: HumanFeedbackChildInput = {
    prompt: currentItem.prompt,
    options: currentItem.options.map((o) => ({
      id: o.id,
      label: o.label,
      ...(o.description !== undefined ? { description: o.description } : {}),
    })),
    questionId: currentItem.questionId,
    requestedByRunId: ctx.runId,
    requestedByWorkflowType: ctx.workflowType,
    requestedByState: NUMBERED_OPTIONS_HUMAN_REQUEST_STATE,
  };

  // SD-OBS-001: emit question generated event
  emitQuestionGenerated(ctx, {
    state: NUMBERED_OPTIONS_HUMAN_REQUEST_STATE,
    questionId: currentItem.questionId,
    kind: currentItem.kind,
    queuePosition: queueIndex,
    queueSize: queue.length,
  });

  let childOutput: HumanFeedbackChildOutput;
  try {
    childOutput = await ctx.launchChild<HumanFeedbackChildInput, HumanFeedbackChildOutput>({
      workflowType: SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
      input: childInput,
      idempotencyKey: `spec-doc:feedback:${ctx.runId}:${currentItem.questionId}`,
    });
  } catch (err) {
    ctx.fail(
      err instanceof Error
        ? err
        : new Error(
            `[${NUMBERED_OPTIONS_HUMAN_REQUEST_STATE}] Feedback child launch failed: ${String(err)}`,
          ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Handle cancelled feedback
  // ---------------------------------------------------------------------------
  if (childOutput.status === 'cancelled') {
    ctx.fail(
      new Error(
        `[${NUMBERED_OPTIONS_HUMAN_REQUEST_STATE}] Feedback for question "${currentItem.questionId}" was cancelled`,
      ),
    );
    return;
  }

  if (!childOutput.response) {
    ctx.fail(
      new Error(
        `[${NUMBERED_OPTIONS_HUMAN_REQUEST_STATE}] Feedback response missing for question "${currentItem.questionId}"`,
      ),
    );
    return;
  }

  const { selectedOptionIds, text } = childOutput.response;

  // ---------------------------------------------------------------------------
  // SD-HRQ-002: Validate response – invalid submissions produce no mutation
  // ---------------------------------------------------------------------------

  // B-SD-HFB-002: validate selectedOptionIds are within valid set
  const optionError = validateSelectedOptionIds(currentItem, selectedOptionIds);
  if (optionError) {
    ctx.log({
      level: 'warn',
      message: `Invalid feedback response for "${currentItem.questionId}": ${optionError}`,
      payload: { questionId: currentItem.questionId, selectedOptionIds },
    });
    // Self-loop with same state data – question remains pending
    ctx.transition(NUMBERED_OPTIONS_HUMAN_REQUEST_STATE, stateData);
    return;
  }

  // B-SD-HFB-003: completion-confirmation requires exactly one selected option
  const cardinalityError = validateCompletionConfirmationCardinality(
    currentItem,
    selectedOptionIds,
  );
  if (cardinalityError) {
    ctx.log({
      level: 'warn',
      message: `Invalid feedback response for "${currentItem.questionId}": ${cardinalityError}`,
      payload: { questionId: currentItem.questionId, selectedOptionIds },
    });
    // Self-loop with same state data – question remains pending
    ctx.transition(NUMBERED_OPTIONS_HUMAN_REQUEST_STATE, stateData);
    return;
  }

  // ---------------------------------------------------------------------------
  // SD-HRQ-003: Record normalized answer (append-only)
  // ---------------------------------------------------------------------------
  const answeredAt = ctx.now().toISOString();
  const answer = createNormalizedAnswer(
    currentItem.questionId,
    selectedOptionIds!,
    answeredAt,
    text,
  );
  const updatedAnswers = appendAnswer(stateData.normalizedAnswers, answer);

  // Mark current item as answered in queue
  const updatedQueue = queue.map((item, idx) =>
    idx === queueIndex ? { ...item, answered: true } : item,
  );

  // SD-OBS-001: emit response received event
  emitResponseReceived(ctx, {
    state: NUMBERED_OPTIONS_HUMAN_REQUEST_STATE,
    questionId: currentItem.questionId,
    selectedOptionIds: selectedOptionIds!,
    hasCustomText: text !== undefined && text.trim().length > 0,
  });

  // ---------------------------------------------------------------------------
  // Transition resolution
  // ---------------------------------------------------------------------------
  const nextIndex = queueIndex + 1;
  const hasMoreItems = nextIndex < updatedQueue.length;

  // Check if response includes custom prompt text → route to ClassifyCustomPrompt
  if (text !== undefined && text.trim().length > 0) {
    const updatedStateData: SpecDocStateData = {
      ...stateData,
      queue: updatedQueue,
      queueIndex: nextIndex,
      normalizedAnswers: updatedAnswers,
    };

    ctx.log({
      level: 'info',
      message: `Custom text provided for "${currentItem.questionId}", routing to ClassifyCustomPrompt`,
      payload: { questionId: currentItem.questionId },
    });

    ctx.transition('ClassifyCustomPrompt', updatedStateData);
    return;
  }

  // Check for completion confirmation
  if (currentItem.questionId === COMPLETION_CONFIRMATION_QUESTION_ID) {
    // Completion confirmed with option 1 ("Yes, the spec is done")
    if (selectedOptionIds![0] === 1) {
      const updatedStateData: SpecDocStateData = {
        ...stateData,
        queue: updatedQueue,
        queueIndex: nextIndex,
        normalizedAnswers: updatedAnswers,
      };

      ctx.log({
        level: 'info',
        message: 'Completion confirmed, routing to Done',
        payload: { questionId: currentItem.questionId },
      });

      ctx.transition('Done', updatedStateData);
      return;
    }

    // Not confirmed (option 2 = "No, continue refining") → route to IntegrateIntoSpec
    const updatedStateData: SpecDocStateData = {
      ...stateData,
      queue: updatedQueue,
      queueIndex: nextIndex,
      normalizedAnswers: updatedAnswers,
    };

    ctx.log({
      level: 'info',
      message: 'Completion not confirmed, routing to IntegrateIntoSpec for further refinement',
      payload: { questionId: currentItem.questionId },
    });

    ctx.transition('IntegrateIntoSpec', updatedStateData);
    return;
  }

  // Self-loop: more queue items remain
  if (hasMoreItems) {
    const updatedStateData: SpecDocStateData = {
      ...stateData,
      queue: updatedQueue,
      queueIndex: nextIndex,
      normalizedAnswers: updatedAnswers,
    };

    ctx.log({
      level: 'info',
      message: `More questions remain, self-looping to next item (${nextIndex + 1}/${updatedQueue.length})`,
      payload: { nextIndex, queueSize: updatedQueue.length },
    });

    ctx.transition(NUMBERED_OPTIONS_HUMAN_REQUEST_STATE, updatedStateData);
    return;
  }

  // SD-HRQ-004: Queue exhausted, not completion → IntegrateIntoSpec
  const updatedStateData: SpecDocStateData = {
    ...stateData,
    queue: updatedQueue,
    queueIndex: nextIndex,
    normalizedAnswers: updatedAnswers,
  };

  ctx.log({
    level: 'info',
    message: 'Queue exhausted without completion confirmation, routing to IntegrateIntoSpec',
    payload: {
      answersCount: updatedAnswers.length,
      queueSize: updatedQueue.length,
    },
  });

  ctx.transition('IntegrateIntoSpec', updatedStateData);
}
