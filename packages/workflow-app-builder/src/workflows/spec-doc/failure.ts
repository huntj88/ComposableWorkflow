/**
 * Failure payload construction utilities for `app-builder.spec-doc.v1`.
 *
 * Provides structured failure payloads for terminal failure conditions:
 * - Copilot child workflow failure with originating FSM state context (SD-TERM-005).
 *
 * Spec references: sections 11, 10.1.
 * Behaviors: B-SD-FAIL-001, B-SD-COPILOT-002.
 *
 * @module spec-doc/failure
 */

// ---------------------------------------------------------------------------
// Failure payload types
// ---------------------------------------------------------------------------

/** Summary of an unresolved question for loop-limit failure diagnostics. */
export interface UnresolvedQuestionSummary {
  questionId: string;
  prompt: string;
}

/**
 * Structured failure payload shape for spec-doc workflow failures.
 *
 * Includes FSM state context, reason category, and optional unresolved
 * question details for loop-overrun diagnostics.
 */
export interface SpecDocFailurePayload {
  /** The FSM state where the failure originated. */
  state: string;
  /** Human-readable failure reason. */
  reason: string;
  /** Unresolved questions at the time of failure (loop-limit failures). */
  unresolvedQuestions: UnresolvedQuestionSummary[];
}

// ---------------------------------------------------------------------------
// SD-TERM-005 – Copilot child failure with stage context
// ---------------------------------------------------------------------------

/**
 * Build a failure payload for a copilot child workflow failure, including
 * the originating FSM state for diagnostic context.
 *
 * @param state - The FSM state where the child failure was received.
 * @param originalError - The error from the failed child workflow.
 * @returns A structured failure payload with state context.
 */
export function buildChildFailurePayload(
  state: string,
  originalError: Error,
): SpecDocFailurePayload {
  return {
    state,
    reason: `Copilot child workflow failed in state "${state}": ${originalError.message}`,
    unresolvedQuestions: [],
  };
}

/**
 * Create an Error for a copilot child workflow failure, embedding the
 * originating FSM state context for propagation.
 *
 * @param state - The FSM state where the child failure was received.
 * @param originalError - The error from the failed child workflow.
 * @returns An Error with state context in the message.
 */
export function createChildFailureError(state: string, originalError: Error): Error {
  const payload = buildChildFailurePayload(state, originalError);
  const err = new Error(`[${state}] ${payload.reason} Details: ${JSON.stringify(payload)}`);
  err.cause = originalError;
  return err;
}
