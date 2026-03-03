/**
 * FSM workflow definition and registration for `app-builder.spec-doc.v1`.
 *
 * Declares the canonical transition map (spec section 6.3), stub state
 * handlers, and the workflow registration constant.
 *
 * @module spec-doc/workflow
 */

import type {
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

import type { SpecDocGenerationInput, SpecDocGenerationOutput } from './contracts.js';
import type { SpecDocState } from './state-data.js';

// ---------------------------------------------------------------------------
// 4) Workflow Identity
// ---------------------------------------------------------------------------

export const SPEC_DOC_WORKFLOW_TYPE = 'app-builder.spec-doc.v1' as const;
export const SPEC_DOC_WORKFLOW_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// 6.3 Transition Map
// ---------------------------------------------------------------------------

/**
 * Canonical transition descriptors derived from spec section 6.3.
 *
 * Only edges listed here are structurally permitted.
 */
export const specDocTransitions: WorkflowTransitionDescriptor[] = [
  // [*] → IntegrateIntoSpec
  {
    from: 'start',
    to: 'IntegrateIntoSpec' satisfies SpecDocState,
    name: 'workflow-input-received',
  },

  // IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions
  {
    from: 'IntegrateIntoSpec' satisfies SpecDocState,
    to: 'LogicalConsistencyCheckCreateFollowUpQuestions' satisfies SpecDocState,
    name: 'integration-pass-complete',
  },

  // LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest
  {
    from: 'LogicalConsistencyCheckCreateFollowUpQuestions' satisfies SpecDocState,
    to: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    name: 'consistency-check-complete',
  },

  // NumberedOptionsHumanRequest → NumberedOptionsHumanRequest (self-loop)
  {
    from: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    to: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    name: 'more-queued-questions',
  },

  // NumberedOptionsHumanRequest → IntegrateIntoSpec
  {
    from: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    to: 'IntegrateIntoSpec' satisfies SpecDocState,
    name: 'queue-exhausted-updates-required',
  },

  // NumberedOptionsHumanRequest → ClassifyCustomPrompt
  {
    from: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    to: 'ClassifyCustomPrompt' satisfies SpecDocState,
    name: 'custom-prompt-provided',
  },

  // NumberedOptionsHumanRequest → Done
  {
    from: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    to: 'Done' satisfies SpecDocState,
    name: 'completion-confirmed',
  },

  // ClassifyCustomPrompt → NumberedOptionsHumanRequest
  {
    from: 'ClassifyCustomPrompt' satisfies SpecDocState,
    to: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    name: 'intent-custom-answer',
  },

  // ClassifyCustomPrompt → ExpandQuestionWithClarification
  {
    from: 'ClassifyCustomPrompt' satisfies SpecDocState,
    to: 'ExpandQuestionWithClarification' satisfies SpecDocState,
    name: 'intent-clarifying-question',
  },

  // ExpandQuestionWithClarification → NumberedOptionsHumanRequest
  {
    from: 'ExpandQuestionWithClarification' satisfies SpecDocState,
    to: 'NumberedOptionsHumanRequest' satisfies SpecDocState,
    name: 'follow-up-question-materialized',
  },
];

// ---------------------------------------------------------------------------
// Allowed-edges lookup (for guard enforcement / testing)
// ---------------------------------------------------------------------------

/** Set of `"from→to"` strings for O(1) guard checks. */
export const ALLOWED_EDGES: ReadonlySet<string> = new Set(
  specDocTransitions.map((t) => `${t.from}→${t.to}`),
);

/**
 * Returns true when the transition from `from` to `to` is declared in
 * the canonical transition map.
 */
export function isAllowedTransition(from: string, to: string): boolean {
  return ALLOWED_EDGES.has(`${from}→${to}`);
}

// ---------------------------------------------------------------------------
// Workflow Definition (stub handlers – real logic added in later TSDs)
// ---------------------------------------------------------------------------

export function createSpecDocWorkflowDefinition(): WorkflowDefinition<
  SpecDocGenerationInput,
  SpecDocGenerationOutput
> {
  return {
    initialState: 'start',
    transitions: specDocTransitions,
    states: {
      start: (ctx) => {
        ctx.transition('IntegrateIntoSpec');
      },

      IntegrateIntoSpec: (_ctx) => {
        // Stub – implemented in later TSD
      },

      LogicalConsistencyCheckCreateFollowUpQuestions: (_ctx) => {
        // Stub – implemented in later TSD
      },

      NumberedOptionsHumanRequest: (_ctx) => {
        // Stub – implemented in later TSD
      },

      ClassifyCustomPrompt: (_ctx) => {
        // Stub – implemented in later TSD
      },

      ExpandQuestionWithClarification: (_ctx) => {
        // Stub – implemented in later TSD
      },

      Done: (_ctx) => {
        // Stub – implemented in later TSD
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const specDocWorkflowRegistration: WorkflowRegistration<
  SpecDocGenerationInput,
  SpecDocGenerationOutput
> = {
  workflowType: SPEC_DOC_WORKFLOW_TYPE,
  workflowVersion: SPEC_DOC_WORKFLOW_VERSION,
  metadata: {
    displayName: 'Spec-Doc Generation Workflow',
    description:
      'Iterative FSM workflow that converts a human request into an implementation-ready specification document.',
    tags: ['app-builder', 'spec-doc', 'fsm'],
  },
  factory: () => createSpecDocWorkflowDefinition(),
};
