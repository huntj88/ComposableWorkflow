/**
 * B-WEB-031: Dagre layout engine wrapper.
 *
 * - Direction: `LR` at viewport width >=1280px, `TB` below.
 * - Stream overlay updates must NOT trigger relayout.
 * - Pan/zoom viewport preserved across relayout.
 * - B-WEB-041: Layout failure → visible error state with retry; no silent fallback.
 */

import dagre from '@dagrejs/dagre';
import type { Node, Edge } from 'reactflow';

import type { FsmNodeData, FsmEdgeData } from './projectDefinitionToGraph';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LayoutDirection = 'LR' | 'TB';

export type LayoutResult =
  | { ok: true; nodes: Node<FsmNodeData>[]; edges: Edge<FsmEdgeData>[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Breakpoint above which the graph uses LR (left-to-right) layout. */
export const LR_BREAKPOINT_PX = 1280;

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 48;
const DEFAULT_NODE_SEP = 50;
const DEFAULT_RANK_SEP = 80;
const DEFAULT_EDGE_SEP = 20;

// ---------------------------------------------------------------------------
// Direction helper
// ---------------------------------------------------------------------------

export function resolveLayoutDirection(viewportWidth: number): LayoutDirection {
  return viewportWidth >= LR_BREAKPOINT_PX ? 'LR' : 'TB';
}

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

export function layoutGraph(
  nodes: Node<FsmNodeData>[],
  edges: Edge<FsmEdgeData>[],
  direction: LayoutDirection,
): LayoutResult {
  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: DEFAULT_NODE_SEP,
      ranksep: DEFAULT_RANK_SEP,
      edgesep: DEFAULT_EDGE_SEP,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      g.setNode(node.id, {
        width: node.width ?? DEFAULT_NODE_WIDTH,
        height: node.height ?? DEFAULT_NODE_HEIGHT,
      });
    }

    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const positionedNodes: Node<FsmNodeData>[] = nodes.map((node) => {
      const dagreNode = g.node(node.id) as { x: number; y: number } | undefined;
      if (!dagreNode) {
        throw new Error(`dagre did not produce position for node "${node.id}"`);
      }
      return {
        ...node,
        position: {
          x: dagreNode.x - (node.width ?? DEFAULT_NODE_WIDTH) / 2,
          y: dagreNode.y - (node.height ?? DEFAULT_NODE_HEIGHT) / 2,
        },
      };
    });

    return { ok: true, nodes: positionedNodes, edges };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown layout failure';
    return { ok: false, error: message };
  }
}
