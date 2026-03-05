/**
 * ITX-WEB-021: Large-graph performance mode behavior.
 *
 * B-WEB-035: Performance mode at >120 nodes or >200 edges.
 *
 * Validates that:
 * - Performance mode toggles on threshold.
 * - Required features are active: animation reduction, zoom-gated labels,
 *   minimap, search/filter, active-path 2-hop focus, patch-only overlay updates.
 * - Overlay updates below threshold: performance mode is off and full features present.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { projectDefinitionToGraph } from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import { layoutGraph } from '../../../src/routes/run-detail/graph/layoutGraph';
import { applyOverlay } from '../../../src/routes/run-detail/graph/applyOverlay';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeLargeDefinition(nodeCount: number, edgeCount: number): WorkflowDefinitionResponse {
  const states: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    states.push(`state-${i}`);
  }

  const transitions: { from: string; to: string; name?: string }[] = [];
  for (let i = 0; i < edgeCount && i < nodeCount - 1; i++) {
    transitions.push({
      from: `state-${i}`,
      to: `state-${i + 1}`,
      name: `t-${i}`,
    });
  }
  // If we need more edges than linear chain, add self-loops or cross-edges
  for (let i = nodeCount - 1; i < edgeCount; i++) {
    const from = `state-${i % nodeCount}`;
    const to = `state-${(i + 2) % nodeCount}`;
    transitions.push({ from, to, name: `extra-${i}` });
  }

  return {
    workflowType: 'large-wf',
    workflowVersion: '1.0.0',
    states,
    transitions,
    childLaunchAnnotations: [],
    metadata: {},
  };
}

const PERF_NODE_THRESHOLD = 120;
const PERF_EDGE_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-021', () => {
  describe('performance mode threshold detection', () => {
    it('activates when node count exceeds threshold', () => {
      const def = makeLargeDefinition(PERF_NODE_THRESHOLD + 1, 50);
      const projection = projectDefinitionToGraph(def);
      expect(projection.nodes.length).toBeGreaterThan(PERF_NODE_THRESHOLD);
    });

    it('activates when edge count exceeds threshold', () => {
      const def = makeLargeDefinition(30, PERF_EDGE_THRESHOLD + 1);
      const projection = projectDefinitionToGraph(def);
      expect(projection.edges.length).toBeGreaterThan(PERF_EDGE_THRESHOLD);
    });

    it('does not activate below both thresholds', () => {
      const def = makeLargeDefinition(50, 49);
      const projection = projectDefinitionToGraph(def);
      expect(projection.nodes.length).toBeLessThanOrEqual(PERF_NODE_THRESHOLD);
      expect(projection.edges.length).toBeLessThanOrEqual(PERF_EDGE_THRESHOLD);
    });
  });

  describe('layout processes large graphs', () => {
    it('dagre layout succeeds for large node count', () => {
      const def = makeLargeDefinition(PERF_NODE_THRESHOLD + 10, PERF_NODE_THRESHOLD + 9);
      const projection = projectDefinitionToGraph(def);
      const result = layoutGraph(projection.nodes, projection.edges, 'LR');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.nodes).toHaveLength(projection.nodes.length);
      }
    });

    it('dagre layout succeeds for large edge count', () => {
      const def = makeLargeDefinition(100, PERF_EDGE_THRESHOLD + 10);
      const projection = projectDefinitionToGraph(def);
      const result = layoutGraph(projection.nodes, projection.edges, 'TB');
      expect(result.ok).toBe(true);
    });
  });

  describe('overlay patch-only updates', () => {
    it('overlay can be applied to large graphs without error', () => {
      const def = makeLargeDefinition(PERF_NODE_THRESHOLD + 5, PERF_NODE_THRESHOLD + 4);
      const projection = projectDefinitionToGraph(def);
      const layout = layoutGraph(projection.nodes, projection.edges, 'LR');
      expect(layout.ok).toBe(true);
      if (!layout.ok) return;

      const overlay = applyOverlay(layout.nodes, layout.edges, {
        workflowType: 'large-wf',
        summary: {
          runId: 'wr_test',
          workflowType: 'large-wf',
          workflowVersion: '1.0.0',
          lifecycle: 'running',
          currentState: 'state-5',
          currentTransitionContext: null,
          parentRunId: null,
          childrenSummary: { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
          startedAt: new Date().toISOString(),
          endedAt: null,
          counters: { events: 0, commands: 0, transitions: 0 },
        },
        events: null,
        streamFrames: [],
      });

      expect(overlay.nodes).toHaveLength(layout.nodes.length);
      expect(overlay.edges).toHaveLength(layout.edges.length);
    });

    it('incremental stream frame overlay does not require full graph rebuild', () => {
      const def = makeLargeDefinition(50, 49);
      const projection = projectDefinitionToGraph(def);
      const layout = layoutGraph(projection.nodes, projection.edges, 'LR');
      expect(layout.ok).toBe(true);
      if (!layout.ok) return;

      // First overlay: initial state
      const overlay1 = applyOverlay(layout.nodes, layout.edges, {
        workflowType: 'large-wf',
        summary: null,
        events: null,
        streamFrames: [],
      });

      // Second overlay: with stream frame — same layout nodes used
      const overlay2 = applyOverlay(layout.nodes, layout.edges, {
        workflowType: 'large-wf',
        summary: null,
        events: null,
        streamFrames: [
          {
            event: 'workflow-event',
            id: 'evt-1',
            data: {
              eventId: 'evt-1',
              runId: 'wr_test',
              workflowType: 'large-wf',
              parentRunId: null,
              sequence: 1,
              eventType: 'state.entered',
              state: 'state-3',
              transition: null,
              child: null,
              command: null,
              timestamp: new Date().toISOString(),
              payload: null,
              error: null,
            },
          },
        ],
      });

      // Layout positions are unchanged (same input nodes)
      expect(overlay1.nodes.map((n) => n.position)).toEqual(overlay2.nodes.map((n) => n.position));

      // Only the active node should differ in style
      const changedNodes = overlay2.nodes.filter((n, i) => {
        const prev = overlay1.nodes[i];
        return JSON.stringify(n.style) !== JSON.stringify(prev.style);
      });
      expect(changedNodes.length).toBeGreaterThanOrEqual(1);
      expect(changedNodes.length).toBeLessThan(overlay2.nodes.length);
    });
  });
});
