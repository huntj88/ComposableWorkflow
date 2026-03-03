/**
 * Done state handler for `app-builder.spec-doc.v1`.
 *
 * Validates completion-confirmation semantics, constructs the terminal
 * output payload conforming to `spec-doc-generation-output.schema.json`,
 * and emits the completed output via `ctx.complete()`.
 *
 * Spec references: sections 5.2, 10, 10.1.
 * Behaviors: B-SD-DONE-001, B-SD-DONE-002, B-SD-DONE-003, B-SD-TRANS-007.
 *
 * @module spec-doc/states/done
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { SpecDocGenerationInput, SpecDocGenerationOutput } from '../contracts.js';
import { emitTerminalCompleted } from '../observability.js';
import { type SpecDocStateData, createInitialStateData } from '../state-data.js';
import { COMPLETION_CONFIRMATION_QUESTION_ID } from '../queue.js';
import { createSpecDocValidator } from '../schema-validation.js';
import { SCHEMA_IDS } from '../schemas.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DONE_STATE = 'Done' as const;

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

/**
 * Execute the `Done` terminal state.
 *
 * Preconditions (enforced by transition map — `Done` reachable only from
 * `NumberedOptionsHumanRequest`):
 * - Completion confirmation was selected with exactly one option.
 * - `specPath` is available in artifacts.
 * - At least one integration pass and one consistency-check pass completed.
 *
 * This handler:
 * 1. Validates that a completion confirmation answer exists (SD-TERM-002).
 * 2. Validates that `specPath` is set in artifacts.
 * 3. Constructs the terminal output payload (SD-TERM-003).
 * 4. Validates the payload against `spec-doc-generation-output.schema.json`.
 * 5. Emits the payload via `ctx.complete()`.
 */
export function handleDone(
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>,
  data?: unknown,
): void {
  const stateData: SpecDocStateData =
    (data as SpecDocStateData | undefined) ?? createInitialStateData();

  // ---------------------------------------------------------------------------
  // SD-TERM-002: Validate completion-confirmation cardinality
  // ---------------------------------------------------------------------------
  const completionAnswer = stateData.normalizedAnswers.find(
    (a) => a.questionId === COMPLETION_CONFIRMATION_QUESTION_ID,
  );

  if (!completionAnswer) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] Missing completion-confirmation answer. ` +
          `No answer found for questionId "${COMPLETION_CONFIRMATION_QUESTION_ID}".`,
      ),
    );
    return;
  }

  if (completionAnswer.selectedOptionIds.length !== 1) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] Completion-confirmation requires exactly one selectedOptionId, ` +
          `got ${completionAnswer.selectedOptionIds.length}.`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate specPath is available
  // ---------------------------------------------------------------------------
  const { specPath } = stateData.artifacts;

  if (!specPath) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] specPath is not set in artifacts. ` +
          `Cannot emit terminal output without a valid spec path.`,
      ),
    );
    return;
  }

  if (!specPath.endsWith('.md')) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] specPath "${specPath}" does not end with ".md". ` +
          `Terminal output requires a markdown file path.`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate minimum pass counts
  // ---------------------------------------------------------------------------
  const { integrationPasses, consistencyCheckPasses } = stateData.counters;

  if (integrationPasses < 1) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] integrationPasses is ${integrationPasses}, but at least 1 is required.`,
      ),
    );
    return;
  }

  if (consistencyCheckPasses < 1) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] consistencyCheckPasses is ${consistencyCheckPasses}, but at least 1 is required.`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // SD-TERM-003: Construct terminal output payload
  // ---------------------------------------------------------------------------
  const output: SpecDocGenerationOutput = {
    status: 'completed',
    specPath,
    summary: {
      loopsUsed: stateData.counters.clarificationLoopsUsed,
      unresolvedQuestions: 0,
    },
    artifacts: {
      integrationPasses,
      consistencyCheckPasses,
    },
  };

  // ---------------------------------------------------------------------------
  // Schema-validate the terminal payload before emitting
  // ---------------------------------------------------------------------------
  const validator = createSpecDocValidator();
  const result = validator.validateParsed<SpecDocGenerationOutput>(
    output,
    SCHEMA_IDS.specDocGenerationOutput,
  );

  if (!result.ok) {
    ctx.fail(
      new Error(
        `[${DONE_STATE}] Terminal output failed schema validation against ` +
          `"${SCHEMA_IDS.specDocGenerationOutput}": ${result.error.details}`,
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Emit terminal output
  // ---------------------------------------------------------------------------
  // SD-OBS-001: emit terminal completed event
  emitTerminalCompleted(ctx, {
    state: DONE_STATE,
    specPath,
    loopsUsed: stateData.counters.clarificationLoopsUsed,
    integrationPasses,
    consistencyCheckPasses,
  });

  ctx.complete(output);
}
