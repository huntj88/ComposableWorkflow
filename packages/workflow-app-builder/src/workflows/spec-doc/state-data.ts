/**
 * FSM state identifiers and persistent state data model for
 * `app-builder.spec-doc.v1`.
 *
 * Spec references: sections 6.2, 6.3, 10.1.
 *
 * @module spec-doc/state-data
 */

import type { NormalizedAnswer, QuestionQueueItem, SpecIntegrationOutput } from './contracts.js';

// ---------------------------------------------------------------------------
// 6.2 Canonical State Identifiers
// ---------------------------------------------------------------------------

/** All six canonical FSM states from spec section 6.2. */
export const SPEC_DOC_STATES = [
  'IntegrateIntoSpec',
  'LogicalConsistencyCheckCreateFollowUpQuestions',
  'NumberedOptionsHumanRequest',
  'ClassifyCustomPrompt',
  'ExpandQuestionWithClarification',
  'Done',
] as const;

export type SpecDocState = (typeof SPEC_DOC_STATES)[number];

// ---------------------------------------------------------------------------
// Persisted State Data
// ---------------------------------------------------------------------------

/** Persisted counters across transitions (task doc interface contract). */
export interface SpecDocCounters {
  /** Number of clarification self-loops consumed. */
  clarificationLoopsUsed: number;
  /** Number of IntegrateIntoSpec passes completed. */
  integrationPasses: number;
  /** Number of LogicalConsistencyCheckCreateFollowUpQuestions passes completed. */
  consistencyCheckPasses: number;
}

/** Working artifacts produced during the workflow run. */
export interface SpecDocArtifacts {
  /** Path to the current working spec markdown draft on disk. */
  specPath?: string;
  /** Latest integration output metadata. */
  lastIntegrationOutput?: SpecIntegrationOutput;
}

/**
 * Root state data model persisted across FSM transitions.
 *
 * Stores the deterministic question queue, normalized answer history,
 * counters, and working artifacts as required by spec section 6 and the
 * task doc (SD-FSM-004-StateDataBackbone).
 */
export interface SpecDocStateData {
  /** Deterministic question queue for NumberedOptionsHumanRequest. */
  queue: QuestionQueueItem[];
  /** Accumulated normalized answers indexed by questionId appearance order. */
  normalizedAnswers: NormalizedAnswer[];
  /** Persisted loop / pass counters. */
  counters: SpecDocCounters;
  /** Working artifacts (spec draft path, integration metadata). */
  artifacts: SpecDocArtifacts;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a fresh initial state data instance. */
export function createInitialStateData(): SpecDocStateData {
  return {
    queue: [],
    normalizedAnswers: [],
    counters: {
      clarificationLoopsUsed: 0,
      integrationPasses: 0,
      consistencyCheckPasses: 0,
    },
    artifacts: {},
  };
}
