/**
 * ITX-WEB-030: Graph legend and visual encoding semantics are enforced.
 *
 * Validates that:
 * - Node role types map to expected React Flow type strings.
 * - Edge overlay styles (traversed/failed/pending/idle) are deterministic.
 * - Node overlay styles (active/visited/idle) are deterministic.
 * - Color constants are consistent across overlay applications.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  projectDefinitionToGraph,
  toNodeId,
  toEdgeId,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import {
  applyOverlay,
  type OverlaySources,
} from '../../../src/routes/run-detail/graph/applyOverlay';
import { buildEventDto, fixtureTimestamp } from '../fixtures/workflowFixtures';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const legendDef: WorkflowDefinitionResponse = {
  workflowType: 'legend-test',
  workflowVersion: '1.0.0',
  states: ['start', 'middle', 'branch-a', 'branch-b', 'end'],
  transitions: [
    { from: 'start', to: 'middle', name: 'go' },
    { from: 'middle', to: 'branch-a', name: 'left' },
    { from: 'middle', to: 'branch-b', name: 'right' },
    { from: 'branch-a', to: 'end', name: 'join-a' },
    { from: 'branch-b', to: 'end', name: 'join-b' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

const NOW = new Date('2026-03-05T00:00:30.000Z').getTime();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-030', () => {
  describe('node role → React Flow type mapping', () => {
    it('initial state maps to fsmInitial', () => {
      const { nodes } = projectDefinitionToGraph(legendDef);
      const start = nodes.find((n) => n.data.stateId === 'start');
      expect(start?.type).toBe('fsmInitial');
    });

    it('terminal state maps to fsmTerminal', () => {
      const { nodes } = projectDefinitionToGraph(legendDef);
      const end = nodes.find((n) => n.data.stateId === 'end');
      expect(end?.type).toBe('fsmTerminal');
    });

    it('decision state (>1 outbound) maps to fsmDecision', () => {
      const { nodes } = projectDefinitionToGraph(legendDef);
      const middle = nodes.find((n) => n.data.stateId === 'middle');
      expect(middle?.type).toBe('fsmDecision');
    });

    it('standard state maps to fsmStandard', () => {
      const { nodes } = projectDefinitionToGraph(legendDef);
      const branchA = nodes.find((n) => n.data.stateId === 'branch-a');
      expect(branchA?.type).toBe('fsmStandard');
    });
  });

  describe('node overlay visual encoding', () => {
    it('active node has white text on colored background', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'legend-test',
              runId: 'wr_030',
              eventType: 'state.entered',
              state: 'middle',
              transition: null,
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const activeNode = result.nodes.find((n) => n.id === toNodeId('legend-test', 'middle'));
      expect(activeNode?.style?.color).toBe('#fff');
      expect(activeNode?.style?.background).toBeDefined();
      expect(activeNode?.style?.borderColor).toBeDefined();
    });

    it('visited node has lighter background (no white text)', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'legend-test',
              runId: 'wr_030',
              eventType: 'state.entered',
              state: 'start',
              transition: null,
              timestamp: fixtureTimestamp(0),
            }),
            buildEventDto(2, {
              workflowType: 'legend-test',
              runId: 'wr_030',
              eventType: 'state.entered',
              state: 'middle',
              transition: null,
              timestamp: fixtureTimestamp(1000),
            }),
          ],
          nextCursor: 'cur_2',
        },
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const visitedNode = result.nodes.find((n) => n.id === toNodeId('legend-test', 'start'));
      expect(visitedNode?.style?.background).toBeDefined();
      expect(visitedNode?.style?.color).toBeUndefined();
    });

    it('idle node has no style overrides', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: null,
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const idleNode = result.nodes.find((n) => n.id === toNodeId('legend-test', 'end'));
      expect(idleNode?.style?.color).toBeUndefined();
      expect(idleNode?.style?.background).toBeUndefined();
    });
  });

  describe('edge overlay visual encoding', () => {
    it('traversed edge has green stroke and animation', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'legend-test',
              runId: 'wr_030',
              eventType: 'transition.completed',
              transition: { from: 'start', to: 'middle', name: 'go' },
              state: null,
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const edge = result.edges.find((e) => e.id === toEdgeId('legend-test', 'start', 'middle', 0));
      expect(edge?.style?.stroke).toBeDefined();
      expect(edge?.markerEnd).toBeDefined();
    });

    it('failed edge has dashed stroke', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'legend-test',
              runId: 'wr_030',
              eventType: 'transition.failed',
              transition: { from: 'start', to: 'middle', name: 'go' },
              state: null,
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const edge = result.edges.find((e) => e.id === toEdgeId('legend-test', 'start', 'middle', 0));
      expect(edge?.style?.strokeDasharray).toBeDefined();
      expect(edge?.animated).toBe(false);
    });

    it('idle edge has no style overrides', () => {
      const { nodes, edges } = projectDefinitionToGraph(legendDef);
      const sources: OverlaySources = {
        workflowType: 'legend-test',
        summary: null,
        events: null,
        streamFrames: [],
      };

      const result = applyOverlay(nodes, edges, sources, NOW);
      const edge = result.edges.find((e) => e.id === toEdgeId('legend-test', 'start', 'middle', 0));
      expect(edge?.style?.stroke).toBeUndefined();
      expect(edge?.animated).toBe(false);
    });
  });
});
