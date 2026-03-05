/**
 * B-WEB-030: Deterministic definition projection to React Flow nodes/edges.
 *
 * Node ID format: `{workflowType}::state::{stateId}`
 * Edge ID format: `{workflowType}::edge::{fromState}::{toState}::{transitionOrdinal}`
 *
 * Role classification:
 *   - initial:   first state in the definition's states array
 *   - terminal:  states that have no outbound transitions
 *   - decision:  states with more than one outbound transition
 *   - standard:  everything else
 */

import type { Node, Edge } from 'reactflow';

import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NodeRole = 'initial' | 'terminal' | 'decision' | 'standard';

export type FsmNodeData = {
  stateId: string;
  role: NodeRole;
  workflowType: string;
  /** child-launch annotation metadata attached to this state (B-WEB-034). */
  childLaunchAnnotations: Record<string, unknown>[];
};

export type FsmEdgeData = {
  fromState: string;
  toState: string;
  transitionName: string | undefined;
  ordinal: number;
  workflowType: string;
};

export type FsmNode = Node<FsmNodeData>;
export type FsmEdge = Edge<FsmEdgeData>;

export type ProjectionResult = {
  nodes: FsmNode[];
  edges: FsmEdge[];
  /** Invariant violations detected during projection (B-WEB-033). */
  invariantViolations: InvariantViolation[];
};

export type InvariantViolation = {
  kind: 'duplicate-state' | 'unresolved-transition-ref' | 'unstable-transition';
  message: string;
};

// ---------------------------------------------------------------------------
// Node ID helpers (deterministic, exported for overlay mapping)
// ---------------------------------------------------------------------------

export const toNodeId = (workflowType: string, stateId: string): string =>
  `${workflowType}::state::${stateId}`;

export const toEdgeId = (workflowType: string, from: string, to: string, ordinal: number): string =>
  `${workflowType}::edge::${from}::${to}::${ordinal}`;

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export function projectDefinitionToGraph(definition: WorkflowDefinitionResponse): ProjectionResult {
  const { workflowType, states, transitions, childLaunchAnnotations } = definition;

  const violations: InvariantViolation[] = [];

  // --- Detect duplicate state IDs ------------------------------------------
  const stateSet = new Set<string>();
  for (const s of states) {
    if (stateSet.has(s)) {
      violations.push({
        kind: 'duplicate-state',
        message: `Duplicate state ID "${s}" in definition for "${workflowType}".`,
      });
    }
    stateSet.add(s);
  }

  // --- Compute outbound counts (for role classification) -------------------
  const outboundCount = new Map<string, number>();
  for (const t of transitions) {
    outboundCount.set(t.from, (outboundCount.get(t.from) ?? 0) + 1);
  }

  // --- Build per-transition ordinal counters (for deterministic edge IDs) --
  const ordinalCounters = new Map<string, number>();
  const ordinalForTransition = (from: string, to: string): number => {
    const key = `${from}::${to}`;
    const current = ordinalCounters.get(key) ?? 0;
    ordinalCounters.set(key, current + 1);
    return current;
  };

  // --- Index child-launch annotations by state ----------------------------
  const annotationsByState = new Map<string, Record<string, unknown>[]>();
  for (const annotation of childLaunchAnnotations) {
    const parentState =
      typeof annotation['parentState'] === 'string' ? annotation['parentState'] : undefined;
    if (parentState) {
      const existing = annotationsByState.get(parentState) ?? [];
      existing.push(annotation);
      annotationsByState.set(parentState, existing);
    }
  }

  // --- Determine initial state (first in states array) --------------------
  const initialStateId = states.length > 0 ? states[0] : undefined;

  // --- Build nodes ---------------------------------------------------------
  const nodes: FsmNode[] = [];
  for (const stateId of states) {
    // Skip second occurrence of duplicates (violation already recorded)
    if (nodes.some((n) => n.data.stateId === stateId)) continue;

    const role = classifyRole(stateId, initialStateId, outboundCount);
    const nodeId = toNodeId(workflowType, stateId);

    nodes.push({
      id: nodeId,
      type: roleToNodeType(role),
      position: { x: 0, y: 0 }, // layout engine will position
      data: {
        stateId,
        role,
        workflowType,
        childLaunchAnnotations: annotationsByState.get(stateId) ?? [],
      },
    });
  }

  // --- Build edges ---------------------------------------------------------
  const edges: FsmEdge[] = [];
  for (const t of transitions) {
    // Validate references
    if (!stateSet.has(t.from)) {
      violations.push({
        kind: 'unresolved-transition-ref',
        message: `Transition references unknown source state "${t.from}" in "${workflowType}".`,
      });
    }
    if (!stateSet.has(t.to)) {
      violations.push({
        kind: 'unresolved-transition-ref',
        message: `Transition references unknown target state "${t.to}" in "${workflowType}".`,
      });
    }

    const ordinal = ordinalForTransition(t.from, t.to);
    const edgeId = toEdgeId(workflowType, t.from, t.to, ordinal);

    edges.push({
      id: edgeId,
      source: toNodeId(workflowType, t.from),
      target: toNodeId(workflowType, t.to),
      label: t.name,
      animated: false,
      data: {
        fromState: t.from,
        toState: t.to,
        transitionName: t.name,
        ordinal,
        workflowType,
      },
    });
  }

  return { nodes, edges, invariantViolations: violations };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyRole(
  stateId: string,
  initialStateId: string | undefined,
  outboundCount: Map<string, number>,
): NodeRole {
  if (stateId === initialStateId) return 'initial';
  const outbound = outboundCount.get(stateId) ?? 0;
  if (outbound === 0) return 'terminal';
  if (outbound > 1) return 'decision';
  return 'standard';
}

function roleToNodeType(role: NodeRole): string {
  switch (role) {
    case 'initial':
      return 'fsmInitial';
    case 'terminal':
      return 'fsmTerminal';
    case 'decision':
      return 'fsmDecision';
    case 'standard':
      return 'fsmStandard';
  }
}
