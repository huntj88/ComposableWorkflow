/**
 * ITX-WEB-032: Graph node selection detail reveal is enforced.
 *
 * Validates that:
 * - Projected nodes contain all data fields needed for detail reveal.
 * - FsmNodeData has stateId, role, workflowType, and childLaunchAnnotations.
 * - FsmEdgeData has fromState, toState, transitionName, ordinal, workflowType.
 * - Data is accessible from projected graph for selection-driven UI.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  projectDefinitionToGraph,
  type FsmNodeData,
  type FsmEdgeData,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const detailDef: WorkflowDefinitionResponse = {
  workflowType: 'detail-wf',
  workflowVersion: '2.5.0',
  states: ['start', 'processing', 'decision', 'complete', 'error'],
  transitions: [
    { from: 'start', to: 'processing', name: 'begin' },
    { from: 'processing', to: 'decision', name: 'evaluate' },
    { from: 'decision', to: 'complete', name: 'approve' },
    { from: 'decision', to: 'error', name: 'reject' },
  ],
  childLaunchAnnotations: [
    { parentState: 'processing', childWorkflowType: 'sub-task', retryPolicy: 'exponential' },
  ],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-032', () => {
  describe('FsmNodeData completeness', () => {
    it('every node has stateId, role, workflowType, childLaunchAnnotations', () => {
      const { nodes } = projectDefinitionToGraph(detailDef);

      for (const node of nodes) {
        const data: FsmNodeData = node.data;
        expect(typeof data.stateId).toBe('string');
        expect(data.stateId.length).toBeGreaterThan(0);
        expect(['initial', 'terminal', 'decision', 'standard']).toContain(data.role);
        expect(data.workflowType).toBe('detail-wf');
        expect(Array.isArray(data.childLaunchAnnotations)).toBe(true);
      }
    });

    it('node data includes rich annotation metadata for detail panel', () => {
      const { nodes } = projectDefinitionToGraph(detailDef);
      const processing = nodes.find((n) => n.data.stateId === 'processing');
      expect(processing?.data.childLaunchAnnotations[0]).toMatchObject({
        childWorkflowType: 'sub-task',
        retryPolicy: 'exponential',
      });
    });
  });

  describe('FsmEdgeData completeness', () => {
    it('every edge has fromState, toState, transitionName, ordinal, workflowType', () => {
      const { edges } = projectDefinitionToGraph(detailDef);

      for (const edge of edges) {
        const data: FsmEdgeData = edge.data!;
        expect(typeof data.fromState).toBe('string');
        expect(typeof data.toState).toBe('string');
        expect(typeof data.ordinal).toBe('number');
        expect(data.workflowType).toBe('detail-wf');
      }
    });

    it('named transitions carry transitionName in edge data', () => {
      const { edges } = projectDefinitionToGraph(detailDef);
      const beginEdge = edges.find((e) => e.data?.transitionName === 'begin');
      expect(beginEdge).toBeDefined();
      expect(beginEdge?.data?.fromState).toBe('start');
      expect(beginEdge?.data?.toState).toBe('processing');
    });

    it('unnamed transitions have undefined transitionName', () => {
      const def: WorkflowDefinitionResponse = {
        workflowType: 'unnamed-edges',
        workflowVersion: '1.0.0',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }],
        childLaunchAnnotations: [],
        metadata: {},
      };

      const { edges } = projectDefinitionToGraph(def);
      expect(edges[0].data?.transitionName).toBeUndefined();
    });
  });

  describe('selection data surface', () => {
    it('node id and data together identify the state for selection', () => {
      const { nodes } = projectDefinitionToGraph(detailDef);
      const decision = nodes.find((n) => n.data.stateId === 'decision');

      expect(decision?.id).toBe('detail-wf::state::decision');
      expect(decision?.data.role).toBe('decision');
      expect(decision?.data.workflowType).toBe('detail-wf');
    });

    it('edge id and data together identify the transition for selection', () => {
      const { edges } = projectDefinitionToGraph(detailDef);
      const reject = edges.find((e) => e.data?.transitionName === 'reject');

      expect(reject?.id).toBe('detail-wf::edge::decision::error::0');
      expect(reject?.data?.fromState).toBe('decision');
      expect(reject?.data?.toState).toBe('error');
      expect(reject?.data?.ordinal).toBe(0);
    });
  });
});
