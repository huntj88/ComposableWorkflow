/**
 * Normalized answer accumulation utilities for `app-builder.spec-doc.v1`.
 *
 * Provides append-only answer recording with validation for the
 * `NumberedOptionsHumanRequest` queue processor.
 *
 * Spec references: sections 6.4, 6.5.
 * Behaviors: B-SD-QUEUE-004, B-SD-HFB-002, B-SD-HFB-003.
 *
 * @module spec-doc/answers
 */

import type { NormalizedAnswer, QuestionQueueItem } from './contracts.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a feedback response contains either selected options or
 * non-whitespace custom text.
 *
 * Returns an error message string if invalid, or `undefined` if valid.
 */
export function validateResponseContent(
  item: QuestionQueueItem,
  selectedOptionIds: number[] | undefined,
  text: string | undefined,
): string | undefined {
  const hasSelectedOptions = (selectedOptionIds?.length ?? 0) > 0;
  const hasCustomText = (text?.trim().length ?? 0) > 0;

  if (!hasSelectedOptions && !hasCustomText) {
    return (
      `Question "${item.questionId}" requires either selectedOptionIds ` +
      'or non-empty custom text'
    );
  }

  return undefined;
}

/**
 * Validate that `selectedOptionIds` are all valid for the given queue item.
 *
 * Returns an error message string if invalid, or `undefined` if valid.
 */
export function validateSelectedOptionIds(
  item: QuestionQueueItem,
  selectedOptionIds: number[] | undefined,
): string | undefined {
  if (!selectedOptionIds || selectedOptionIds.length === 0) {
    return undefined;
  }

  const validIds = new Set(item.options.map((o) => o.id));
  const invalid = selectedOptionIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return (
      `Invalid selectedOptionIds [${invalid.join(', ')}] for question "${item.questionId}". ` +
      `Valid IDs: [${[...validIds].sort((a, b) => a - b).join(', ')}]`
    );
  }

  return undefined;
}

/**
 * Validate completion-confirmation cardinality: at most one selected option.
 *
 * Returns an error message string if invalid, or `undefined` if valid.
 */
export function validateCompletionConfirmationCardinality(
  item: QuestionQueueItem,
  selectedOptionIds: number[] | undefined,
): string | undefined {
  if (item.kind !== 'completion-confirmation') {
    return undefined;
  }

  if ((selectedOptionIds?.length ?? 0) > 1) {
    return (
      `Completion-confirmation question "${item.questionId}" allows at most one selectedOptionId, ` +
      `got ${selectedOptionIds?.length ?? 0}`
    );
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Answer Recording
// ---------------------------------------------------------------------------

/**
 * Create a normalized answer record from a validated feedback response.
 *
 * Answer records are append-only; once created they are never rewritten.
 */
export function createNormalizedAnswer(
  questionId: string,
  selectedOptionIds: number[],
  answeredAt: string,
  text?: string,
): NormalizedAnswer {
  return {
    questionId,
    selectedOptionIds,
    ...(text !== undefined ? { text } : {}),
    answeredAt,
  };
}

/**
 * Append a normalized answer to the existing answer list (append-only).
 *
 * Returns a new array; the original is never mutated.
 */
export function appendAnswer(
  existing: readonly NormalizedAnswer[],
  answer: NormalizedAnswer,
): NormalizedAnswer[] {
  return [...existing, answer];
}
