/**
 * Deterministic question queue utilities for `app-builder.spec-doc.v1`.
 *
 * Provides sorting and completion-confirmation synthesis for the
 * `NumberedOptionsHumanRequest` question queue.
 *
 * Spec references: sections 6.3, 6.4, 7.1, 7.2.2, 10.1.
 * Behaviors: B-SD-QUEUE-001, B-SD-TRANS-003, B-SD-TRANS-011.
 *
 * @module spec-doc/queue
 */

import type {
  NumberedQuestionItem,
  NumberedQuestionOption,
  QuestionQueueItem,
} from './contracts.js';

// ---------------------------------------------------------------------------
// SD-CHECK-002 – Deterministic Queue Ordering
// ---------------------------------------------------------------------------

/**
 * Sort question items deterministically by `questionId` using locale-independent
 * string comparison. The sort is stable across retries and recovery.
 */
export function sortByQuestionId<T extends { questionId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.questionId < b.questionId) return -1;
    if (a.questionId > b.questionId) return 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// SD-CHECK-003 – Completion-Confirmation Synthesis
// ---------------------------------------------------------------------------

/** Stable question ID for the workflow-authored completion-confirmation item. */
export const COMPLETION_CONFIRMATION_QUESTION_ID = 'completion-confirmation' as const;

/** Default option for confirming spec completion. */
const COMPLETION_DONE_OPTION: NumberedQuestionOption = {
  id: 1,
  label: 'Yes, the spec is done',
  description:
    'Confirms the specification document is complete and ready for implementation. ' +
    'Pros: Finalizes the workflow and produces the deliverable. ' +
    'Cons: No further refinement will occur after confirmation.',
};

/** Default option for requesting another review pass. */
const COMPLETION_CONTINUE_OPTION: NumberedQuestionOption = {
  id: 2,
  label: 'No, continue refining',
  description:
    'Requests another consistency-check and integration pass. ' +
    'Pros: Allows additional refinement and issue resolution. ' +
    'Cons: Extends the workflow duration with another iteration cycle.',
};

/**
 * Synthesize the workflow-authored completion-confirmation question.
 *
 * This item is never model-authored. It is generated deterministically by
 * workflow logic when the consistency check returns an empty `followUpQuestions`
 * array, indicating the spec has no remaining blocking issues.
 *
 * The returned item includes an explicit "spec is done" option per spec section 6.3.
 */
export function synthesizeCompletionConfirmation(): NumberedQuestionItem {
  return {
    questionId: COMPLETION_CONFIRMATION_QUESTION_ID,
    kind: 'completion-confirmation',
    prompt:
      'The consistency check found no remaining blocking issues. ' +
      'Is the specification document complete and ready for implementation?',
    options: [COMPLETION_DONE_OPTION, COMPLETION_CONTINUE_OPTION],
  };
}

// ---------------------------------------------------------------------------
// Queue Building
// ---------------------------------------------------------------------------

/**
 * Build a deterministic question queue from consistency-check follow-up questions.
 *
 * - If `followUpQuestions` is non-empty: sorts by `questionId` and wraps each
 *   item as an unanswered {@link QuestionQueueItem}.
 * - If `followUpQuestions` is empty: synthesizes exactly one completion-confirmation
 *   question with an explicit "spec is done" option.
 *
 * Queue ordering is deterministic and stable across retries/recovery.
 */
export function buildQuestionQueue(followUpQuestions: NumberedQuestionItem[]): QuestionQueueItem[] {
  if (followUpQuestions.length === 0) {
    const confirmation = synthesizeCompletionConfirmation();
    return [
      {
        ...confirmation,
        answered: false,
      },
    ];
  }

  const sorted = sortByQuestionId(followUpQuestions);
  return sorted.map((q) => ({
    ...q,
    answered: false,
  }));
}
