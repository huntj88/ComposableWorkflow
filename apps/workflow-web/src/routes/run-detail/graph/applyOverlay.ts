/**
 * B-WEB-032: Runtime overlay mapping for FSM graph.
 *
 * Merge order: RunSummaryResponse.currentState → RunEventsResponse events → WorkflowStreamFrame increments.
 *
 * Mappings:
 *   - state.entered     → active node highlight
 *   - transition.completed → traversed edge
 *   - transition.failed    → failed edge + tooltip
 *
 * B-WEB-033: Unknown state/edge references → visible mismatch indicator.
 * B-WEB-043: Time-decayed transition highlighting — newest strongest, deterministic from ordered events.
 */

import type { Node, Edge, MarkerType } from 'reactflow';

import type {
  RunSummaryResponse,
  RunEventsResponse,
  WorkflowEventDto,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import { toNodeId, toEdgeId, type FsmNodeData, type FsmEdgeData } from './projectDefinitionToGraph';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OverlayNodeStatus = 'active' | 'visited' | 'idle';
export type OverlayEdgeStatus = 'traversed' | 'failed' | 'pending' | 'idle';

export type OverlayMismatch = {
  kind: 'unknown-state' | 'unknown-edge';
  reference: string;
  message: string;
};

export type OverlayResult = {
  nodes: Node<FsmNodeData>[];
  edges: Edge<FsmEdgeData>[];
  mismatches: OverlayMismatch[];
};

/** Seconds after which a transition highlight has fully decayed. */
const HIGHLIGHT_DECAY_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Color / style constants
// ---------------------------------------------------------------------------

const ACTIVE_NODE_BG = '#1976d2';
const ACTIVE_NODE_BORDER = '#0d47a1';
const VISITED_NODE_BG = '#e3f2fd';

const TRAVERSED_EDGE_COLOR = '#2e7d32';
const FAILED_EDGE_COLOR = '#d32f2f';
const PENDING_EDGE_COLOR = '#ed6c02';

// ---------------------------------------------------------------------------
// Overlay application
// ---------------------------------------------------------------------------

export function applyOverlay(
  nodes: Node<FsmNodeData>[],
  edges: Edge<FsmEdgeData>[],
  sources: OverlaySources,
  now: number = Date.now(),
): OverlayResult {
  const mismatches: OverlayMismatch[] = [];

  // Build lookup sets for fast membership testing
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edgeIdSet = new Set(edges.map((e) => e.id));

  // --- Accumulate overlay state from sources in merge order ----------------
  const state = buildOverlayState(sources, mismatches, nodeIdSet, edgeIdSet);

  // --- Apply node styles ---------------------------------------------------
  const overlayedNodes = nodes.map((node) => {
    const status = state.nodeStatuses.get(node.id) ?? 'idle';
    return applyNodeStyle(node, status);
  });

  // --- Apply edge styles with time-decay -----------------------------------
  const overlayedEdges = edges.map((edge) => {
    const info = state.edgeStatuses.get(edge.id);
    if (!info) return applyEdgeStyle(edge, 'idle', 1);
    const intensity = computeDecayIntensity(info.timestamp, now);
    return applyEdgeStyle(edge, info.status, intensity);
  });

  return { nodes: overlayedNodes, edges: overlayedEdges, mismatches };
}

// ---------------------------------------------------------------------------
// Overlay source types
// ---------------------------------------------------------------------------

export type OverlaySources = {
  workflowType: string;
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  streamFrames: WorkflowStreamFrame[];
};

// ---------------------------------------------------------------------------
// Internal overlay state accumulator
// ---------------------------------------------------------------------------

type EdgeOverlayInfo = { status: OverlayEdgeStatus; timestamp: number };

type AccumulatedOverlayState = {
  nodeStatuses: Map<string, OverlayNodeStatus>;
  edgeStatuses: Map<string, EdgeOverlayInfo>;
  visitedNodes: Set<string>;
};

function buildOverlayState(
  sources: OverlaySources,
  mismatches: OverlayMismatch[],
  nodeIdSet: Set<string>,
  edgeIdSet: Set<string>,
): AccumulatedOverlayState {
  const { workflowType, summary, events, streamFrames } = sources;

  const nodeStatuses = new Map<string, OverlayNodeStatus>();
  const edgeStatuses = new Map<string, EdgeOverlayInfo>();
  const visitedNodes = new Set<string>();

  // 1. Summary layer: mark currentState as active
  if (summary?.currentState) {
    const nodeId = toNodeId(workflowType, summary.currentState);
    if (nodeIdSet.has(nodeId)) {
      nodeStatuses.set(nodeId, 'active');
      visitedNodes.add(nodeId);
    } else {
      mismatches.push({
        kind: 'unknown-state',
        reference: summary.currentState,
        message: `Summary currentState "${summary.currentState}" not found in definition.`,
      });
    }
  }

  // 2. Events layer: process in sequence order
  if (events?.items) {
    const sorted = [...events.items].sort((a, b) => a.sequence - b.sequence);
    for (const event of sorted) {
      applyEventToState(
        event,
        workflowType,
        nodeStatuses,
        edgeStatuses,
        visitedNodes,
        mismatches,
        nodeIdSet,
        edgeIdSet,
      );
    }
  }

  // 3. Stream frames layer: process in order received
  for (const frame of streamFrames) {
    applyEventToState(
      frame.data,
      workflowType,
      nodeStatuses,
      edgeStatuses,
      visitedNodes,
      mismatches,
      nodeIdSet,
      edgeIdSet,
    );
  }

  // Mark all previously visited (but not currently active) nodes
  for (const nodeId of visitedNodes) {
    if (nodeStatuses.get(nodeId) !== 'active') {
      nodeStatuses.set(nodeId, 'visited');
    }
  }

  return { nodeStatuses, edgeStatuses, visitedNodes };
}

function applyEventToState(
  event: WorkflowEventDto,
  workflowType: string,
  nodeStatuses: Map<string, OverlayNodeStatus>,
  edgeStatuses: Map<string, EdgeOverlayInfo>,
  visitedNodes: Set<string>,
  mismatches: OverlayMismatch[],
  nodeIdSet: Set<string>,
  edgeIdSet: Set<string>,
): void {
  const timestamp = new Date(event.timestamp).getTime();

  if (event.eventType === 'state.entered' && event.state) {
    const nodeId = toNodeId(workflowType, event.state);
    if (nodeIdSet.has(nodeId)) {
      // Demote previous active to visited
      for (const [id, status] of nodeStatuses) {
        if (status === 'active') nodeStatuses.set(id, 'visited');
      }
      nodeStatuses.set(nodeId, 'active');
      visitedNodes.add(nodeId);
    } else {
      mismatches.push({
        kind: 'unknown-state',
        reference: event.state,
        message: `Event references unknown state "${event.state}".`,
      });
    }
  }

  if (event.eventType === 'transition.completed' && event.transition) {
    const from = event.transition.from;
    const to = event.transition.to;
    if (from && to) {
      const edgeId = findMatchingEdgeId(workflowType, from, to, edgeIdSet);
      if (edgeId) {
        edgeStatuses.set(edgeId, { status: 'traversed', timestamp });
      } else {
        mismatches.push({
          kind: 'unknown-edge',
          reference: `${from} → ${to}`,
          message: `Transition.completed references unknown edge "${from}" → "${to}".`,
        });
      }
      // Also mark "from" as visited
      const fromNodeId = toNodeId(workflowType, from);
      if (nodeIdSet.has(fromNodeId)) visitedNodes.add(fromNodeId);
    }
  }

  if (event.eventType === 'transition.failed' && event.transition) {
    const from = event.transition.from;
    const to = event.transition.to;
    if (from && to) {
      const edgeId = findMatchingEdgeId(workflowType, from, to, edgeIdSet);
      if (edgeId) {
        edgeStatuses.set(edgeId, { status: 'failed', timestamp });
      } else {
        mismatches.push({
          kind: 'unknown-edge',
          reference: `${from} → ${to}`,
          message: `Transition.failed references unknown edge "${from}" → "${to}".`,
        });
      }
    }
  }
}

/**
 * Find matching edge ID. Tries ordinal 0 first (most common), then scans.
 */
function findMatchingEdgeId(
  workflowType: string,
  from: string,
  to: string,
  edgeIdSet: Set<string>,
): string | null {
  // Fast path: ordinal 0
  const candidate = toEdgeId(workflowType, from, to, 0);
  if (edgeIdSet.has(candidate)) return candidate;

  // Scan ordinals up to a reasonable limit
  for (let i = 1; i < 20; i++) {
    const id = toEdgeId(workflowType, from, to, i);
    if (edgeIdSet.has(id)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time-decay computation (B-WEB-043)
// ---------------------------------------------------------------------------

/**
 * Returns a value in [0, 1] representing highlight intensity.
 * 1.0 = just happened, 0.0 = fully decayed.
 */
function computeDecayIntensity(eventTimestamp: number, now: number): number {
  const elapsed = Math.max(0, now - eventTimestamp);
  const decayMs = HIGHLIGHT_DECAY_SECONDS * 1000;
  return Math.max(0, 1 - elapsed / decayMs);
}

// ---------------------------------------------------------------------------
// Style application helpers
// ---------------------------------------------------------------------------

function applyNodeStyle(node: Node<FsmNodeData>, status: OverlayNodeStatus): Node<FsmNodeData> {
  switch (status) {
    case 'active':
      return {
        ...node,
        style: {
          ...node.style,
          background: ACTIVE_NODE_BG,
          borderColor: ACTIVE_NODE_BORDER,
          color: '#fff',
        },
      };
    case 'visited':
      return {
        ...node,
        style: {
          ...node.style,
          background: VISITED_NODE_BG,
        },
      };
    case 'idle':
    default:
      return node;
  }
}

function applyEdgeStyle(
  edge: Edge<FsmEdgeData>,
  status: OverlayEdgeStatus,
  intensity: number,
): Edge<FsmEdgeData> {
  switch (status) {
    case 'traversed':
      return {
        ...edge,
        animated: intensity > 0.1,
        style: {
          ...edge.style,
          stroke: TRAVERSED_EDGE_COLOR,
          strokeWidth: 1 + intensity * 2,
          opacity: 0.4 + intensity * 0.6,
        },
        markerEnd: { type: 'arrowclosed' as MarkerType, color: TRAVERSED_EDGE_COLOR },
      };
    case 'failed':
      return {
        ...edge,
        animated: false,
        style: {
          ...edge.style,
          stroke: FAILED_EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: '6 3',
        },
        markerEnd: { type: 'arrowclosed' as MarkerType, color: FAILED_EDGE_COLOR },
        label: edge.label ? `${String(edge.label)} ⚠` : '⚠ Failed',
      };
    case 'pending':
      return {
        ...edge,
        animated: true,
        style: {
          ...edge.style,
          stroke: PENDING_EDGE_COLOR,
          strokeWidth: 2,
        },
      };
    case 'idle':
    default:
      return edge;
  }
}
