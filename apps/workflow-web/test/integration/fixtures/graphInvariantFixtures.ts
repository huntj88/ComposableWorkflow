/**
 * TWEB09: Fixture helpers for malformed graph definitions and unknown
 * runtime overlay references.
 *
 * These fixtures exercise invariant violation detection in:
 * - `projectDefinitionToGraph` (B-WEB-033: duplicate states, unresolved refs)
 * - `applyOverlay` (B-WEB-033: unknown-state, unknown-edge mismatches)
 *
 * Each fixture is documented with expected violation kinds so tests can
 * assert exactly which invariant violations are raised.
 */

import type {
  WorkflowDefinitionResponse,
  RunSummaryResponse,
  RunEventsResponse,
  WorkflowEventDto,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import type { InvariantViolation } from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { OverlayMismatch } from '../../../src/routes/run-detail/graph/applyOverlay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_TIMESTAMP = '2026-03-05T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Malformed definition fixtures (projectDefinitionToGraph violations)
// ---------------------------------------------------------------------------

/**
 * Definition with duplicate state IDs.
 * Expected violations: [{ kind: 'duplicate-state' }]
 */
export const DUPLICATE_STATE_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.duplicate-states',
  workflowVersion: '0.1.0',
  states: ['init', 'processing', 'init', 'done'],
  transitions: [
    { from: 'init', to: 'processing', name: 'start' },
    { from: 'processing', to: 'done', name: 'finish' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

export const DUPLICATE_STATE_EXPECTED_VIOLATIONS: InvariantViolation[] = [
  {
    kind: 'duplicate-state',
    message: 'Duplicate state ID "init" in definition for "malformed.duplicate-states".',
  },
];

/**
 * Definition with transitions referencing non-existent states.
 * Expected violations: 2x unresolved-transition-ref
 */
export const UNRESOLVED_REF_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.unresolved-refs',
  workflowVersion: '0.1.0',
  states: ['start', 'end'],
  transitions: [
    { from: 'start', to: 'end', name: 'valid' },
    { from: 'start', to: 'ghost-target', name: 'broken-target' },
    { from: 'phantom-source', to: 'end', name: 'broken-source' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

export const UNRESOLVED_REF_EXPECTED_VIOLATIONS: InvariantViolation[] = [
  {
    kind: 'unresolved-transition-ref',
    message:
      'Transition references unknown target state "ghost-target" in "malformed.unresolved-refs".',
  },
  {
    kind: 'unresolved-transition-ref',
    message:
      'Transition references unknown source state "phantom-source" in "malformed.unresolved-refs".',
  },
];

/**
 * Definition with both duplicate states and unresolved references.
 * Expected violations: 1x duplicate-state + 1x unresolved-transition-ref
 */
export const COMBINED_VIOLATIONS_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.combined',
  workflowVersion: '0.1.0',
  states: ['a', 'b', 'a'],
  transitions: [
    { from: 'a', to: 'b', name: 'ok' },
    { from: 'b', to: 'nowhere', name: 'broken' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

/**
 * Definition with no states and no transitions (degenerate case).
 * Should produce 0 nodes, 0 edges, 0 violations.
 */
export const EMPTY_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.empty',
  workflowVersion: '0.1.0',
  states: [],
  transitions: [],
  childLaunchAnnotations: [],
  metadata: {},
};

/**
 * Self-referencing transition (from === to).
 * This is a valid definition but unusual — no violations expected.
 */
export const SELF_LOOP_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.self-loop',
  workflowVersion: '0.1.0',
  states: ['polling', 'done'],
  transitions: [
    { from: 'polling', to: 'polling', name: 'retry' },
    { from: 'polling', to: 'done', name: 'complete' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

/**
 * Disconnected graph — states with no transitions connecting them.
 * Valid definition, but graph will have isolated nodes.
 */
export const DISCONNECTED_GRAPH_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'malformed.disconnected',
  workflowVersion: '0.1.0',
  states: ['island-a', 'island-b', 'island-c'],
  transitions: [],
  childLaunchAnnotations: [],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Unknown overlay reference fixtures (applyOverlay mismatches)
// ---------------------------------------------------------------------------

/**
 * A valid 3-state definition used as the base for overlay mismatch tests.
 */
export const OVERLAY_BASE_DEFINITION: WorkflowDefinitionResponse = {
  workflowType: 'overlay-test',
  workflowVersion: '1.0.0',
  states: ['init', 'active', 'done'],
  transitions: [
    { from: 'init', to: 'active', name: 'start' },
    { from: 'active', to: 'done', name: 'finish' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

/**
 * Summary referencing a state that doesn't exist in the definition.
 * Expected mismatch: unknown-state for "non-existent-state".
 */
export const UNKNOWN_STATE_SUMMARY: RunSummaryResponse = {
  runId: 'wr_overlay_1',
  workflowType: 'overlay-test',
  workflowVersion: '1.0.0',
  lifecycle: 'running',
  currentState: 'non-existent-state',
  currentTransitionContext: null,
  parentRunId: null,
  childrenSummary: { total: 0, active: 0, completed: 0, failed: 0, cancelled: 0 },
  startedAt: BASE_TIMESTAMP,
  endedAt: null,
  counters: { eventCount: 1, logCount: 0, childCount: 0 },
};

/**
 * Expected overlay mismatch for UNKNOWN_STATE_SUMMARY.
 */
export const UNKNOWN_STATE_EXPECTED_MISMATCHES: OverlayMismatch[] = [
  {
    kind: 'unknown-state',
    reference: 'non-existent-state',
    message: 'Summary currentState "non-existent-state" not found in definition.',
  },
];

/**
 * Event referencing a state that doesn't exist in the definition.
 */
export function buildUnknownStateEvent(sequence: number): WorkflowEventDto {
  return {
    eventId: `evt_${sequence}`,
    runId: 'wr_overlay_1',
    workflowType: 'overlay-test',
    parentRunId: null,
    sequence,
    eventType: 'state.entered',
    state: 'phantom-state',
    transition: null,
    child: null,
    command: null,
    timestamp: BASE_TIMESTAMP,
    payload: null,
    error: null,
  };
}

/**
 * Event referencing a transition between states where one doesn't exist.
 */
export function buildUnknownEdgeEvent(sequence: number): WorkflowEventDto {
  return {
    eventId: `evt_${sequence}`,
    runId: 'wr_overlay_1',
    workflowType: 'overlay-test',
    parentRunId: null,
    sequence,
    eventType: 'transition.completed',
    state: null,
    transition: { from: 'init', to: 'unknown-target', name: 'broken' },
    child: null,
    command: null,
    timestamp: BASE_TIMESTAMP,
    payload: null,
    error: null,
  };
}

/**
 * Events response containing unknown state references for overlay testing.
 */
export function buildUnknownRefEventsResponse(): RunEventsResponse {
  return {
    items: [buildUnknownStateEvent(1), buildUnknownEdgeEvent(2)],
    nextCursor: 'cur_2',
  };
}

/**
 * Stream frame referencing an unknown state for overlay testing.
 */
export function buildUnknownStateStreamFrame(sequence: number): WorkflowStreamFrame {
  return {
    event: 'workflow-event',
    id: `cur_unknown_${sequence}`,
    data: buildUnknownStateEvent(sequence),
  };
}

/**
 * Stream frame referencing an unknown edge for overlay testing.
 */
export function buildUnknownEdgeStreamFrame(sequence: number): WorkflowStreamFrame {
  return {
    event: 'workflow-event',
    id: `cur_unknown_edge_${sequence}`,
    data: buildUnknownEdgeEvent(sequence),
  };
}

// ---------------------------------------------------------------------------
// Convenience: collect all malformed definition fixtures
// ---------------------------------------------------------------------------

export const ALL_MALFORMED_DEFINITIONS = [
  { name: 'duplicate-states', definition: DUPLICATE_STATE_DEFINITION },
  { name: 'unresolved-refs', definition: UNRESOLVED_REF_DEFINITION },
  { name: 'combined', definition: COMBINED_VIOLATIONS_DEFINITION },
  { name: 'empty', definition: EMPTY_DEFINITION },
  { name: 'self-loop', definition: SELF_LOOP_DEFINITION },
  { name: 'disconnected', definition: DISCONNECTED_GRAPH_DEFINITION },
] as const;
